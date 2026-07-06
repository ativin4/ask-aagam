#!/usr/bin/env python3
"""
Import ALL Jain scriptures from nikkyjain/nikkyjain.github.io into Firestore + Qdrant.
Discovers repo structure, parses HTML sutras, creates vectors for citations.

Usage:
  python3 scripts/import-github-scriptures.py              # import all
  python3 scripts/import-github-scriptures.py --list       # list what will be imported
  python3 scripts/import-github-scriptures.py --book ID    # import specific book ID
  python3 scripts/import-github-scriptures.py --skip-existing  # skip books already in Firestore
"""

import os, re, json, uuid, time, sys, argparse
import requests
from urllib.parse import quote
from pathlib import Path
from html.parser import HTMLParser
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).parent.parent / ".env")
os.environ.update({k: v for k, v in env.items() if v})

PROJECT_ID   = os.environ["NEXT_PUBLIC_FIREBASE_PROJECT_ID"]
CLIENT_EMAIL = os.environ["NEXT_FILE_UPLOAD_CLIENT_EMAIL"]
PRIVATE_KEY  = os.environ["NEXT_FILE_UPLOAD_PRIVATE_KEY"].replace("\\n", "\n")
QDRANT_URL   = os.environ["QDRANT_URL"]
QDRANT_KEY   = os.environ["QDRANT_API_KEY"]
HF_TOKEN     = os.environ["HF_TOKEN"]

QDRANT_COLLECTION = "scripture_pages"
HF_EMBED_API      = "https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large"
REPO_API          = "https://api.github.com/repos/nikkyjain/nikkyjain.github.io/contents"
REPO_RAW          = "https://raw.githubusercontent.com/nikkyjain/nikkyjain.github.io/main"
SHASTRA_PATH      = "jainDataBase/shastra"

# Category mapping from directory names
CATEGORY_MAP = {
    "01_": "Dravyanuyog",
    "02_": "Charananuyog",
    "03_": "Karananuyog",
    "05_": "Prathamanuyog",
}

# Map GitHub scripture dirs to existing Firestore IDs (where known)
EXISTING_BOOK_IDS = {
    # NOTE: "13_तत्त्वार्थसूत्र" NOT mapped — the existing fSCWmgxK6r4HBMMthX5M is
    # "Tatvarthsutra in Charts & Table.pdf" (a different book). GitHub version gets new ID.
    "06_द्रव्यसंग्रह--नेमिचंद्र-सिद्धांतचक्रवर्ती": "hCF00Iahz6m5a8hsCI1G",
    "05_पुरुषार्थसिद्ध्युपाय--आ-अमृतचन्द्र":        "D3y783dGY0rVDruXquGL",
    "01_लब्धिसार--नेमिचंद्र-आचार्य":               "X3ALDe5Th6hd4Me9YSuG",
    "04_वारासाणुवेक्खा--स्वामि-कार्तिकेय":          "qr9p2pHFuFHzwDtt0W1F",
}

from google.cloud import firestore as _gfs
from google.oauth2 import service_account as _svc
import firebase_admin
from firebase_admin import credentials

sa_info = {
    "type": "service_account", "project_id": PROJECT_ID,
    "client_email": CLIENT_EMAIL, "private_key": PRIVATE_KEY,
    "token_uri": "https://oauth2.googleapis.com/token",
}
if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(sa_info))
_sa_creds = _svc.Credentials.from_service_account_info(
    sa_info, scopes=["https://www.googleapis.com/auth/cloud-platform",
                     "https://www.googleapis.com/auth/datastore"])
db = _gfs.Client(project=PROJECT_ID, credentials=_sa_creds)
print("✓ Firestore connected")


# ── HTML Parser ───────────────────────────────────────────────────────────────
class SutraParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current_class = None
        self.gatha, self.paragraph, self.teeka = [], [], []
        self._buf, self._in_target, self._depth = [], False, 0

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        cls = attrs_d.get("class", "")
        if not self._in_target and cls in ("gatha", "paragraph", "paragraphE", "teeka"):
            self.current_class = cls
            self._in_target = True
            self._depth = 1
            self._buf = []
        elif self._in_target and tag == "div":
            self._depth += 1

    def handle_endtag(self, tag):
        if self._in_target and tag == "div":
            self._depth -= 1
            if self._depth == 0:
                text = re.sub(r'<[^>]+>', '', "".join(self._buf))
                text = re.sub(r'\s+', ' ', text).replace('​', '').replace('﻿', '').strip()
                if self.current_class == "gatha":
                    self.gatha.append(text)
                elif self.current_class in ("paragraph", "paragraphE"):
                    self.paragraph.append(text)
                elif self.current_class == "teeka":
                    self.teeka.append(text)
                self._in_target = False

    def handle_data(self, data):
        if self._in_target:
            self._buf.append(data)

    def handle_entityref(self, name):
        if self._in_target:
            imports = {"nbsp": " ", "amp": "&", "lt": "<", "gt": ">"}
            self._buf.append(imports.get(name, ""))

    def handle_charref(self, name):
        if self._in_target:
            try:
                ch = chr(int(name[1:], 16) if name.startswith('x') else int(name))
                self._buf.append(ch)
            except Exception:
                pass


def parse_sutra_html(html: str) -> dict:
    p = SutraParser()
    p.feed(html)
    def clean(s):
        s = re.sub(r'&nbsp;', ' ', s)
        s = re.sub(r'&[a-z]+;', '', s)
        return re.sub(r'\s+', ' ', s).strip()
    return {
        "sutra":      clean(" ".join(p.gatha)),
        "meaning":    clean(" ".join(p.paragraph)),
        "commentary": clean(" ".join(p.teeka[:2])),
    }


# ── Embeddings + Qdrant ───────────────────────────────────────────────────────
def embed_texts(texts: list) -> list:
    import time
    for attempt in range(3):
        try:
            resp = requests.post(
                HF_EMBED_API,
                headers={"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"},
                json={"inputs": [f"passage: {t}" for t in texts]},
                timeout=60,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                raise e
            time.sleep(3)
    return []


def upsert_qdrant(book_id, page_num, chapter, sutra_num, gatha_num, lines, title, categories):
    headers = {"api-key": QDRANT_KEY, "Content-Type": "application/json"}
    scroll = requests.post(
        f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points/scroll",
        headers=headers,
        json={"filter": {"must": [
            {"key": "book_id",     "match": {"value": book_id}},
            {"key": "page_number", "match": {"value": page_num}},
        ]}, "with_payload": False, "limit": 200},
        timeout=30,
    ).json()
    old_ids = [p["id"] for p in scroll.get("result", {}).get("points", [])]
    if old_ids:
        requests.post(f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points/delete",
                      headers=headers, json={"points": old_ids}, timeout=30)

    valid = [l for l in lines if l.strip() and len(l.strip()) >= 15]
    if not valid:
        return 0
    vectors = embed_texts(valid)
    import time
    for attempt in range(3):
        try:
            requests.put(
                f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points",
                headers=headers,
                json={"points": [
            {
                "id": str(uuid.uuid4()), "vector": vectors[j],
                "payload": {
                    "book_id":      book_id,
                    "book_title":   title,
                    "categories":   categories,
                    "page_number":  page_num,
                    "para_number":  j,
                    "line_number":  0,
                    "chapter_number": chapter,
                    "gatha_number": gatha_num,
                    "preview":      valid[j][:400],
                },
            }
            for j in range(len(valid))
        ]},
        timeout=60,
    ).raise_for_status()
            break
        except requests.exceptions.RequestException as e:
            if attempt == 2: raise e
            time.sleep(2)
    return len(valid)


# ── Repo discovery ────────────────────────────────────────────────────────────
def raw_url(path: str) -> str:
    """Convert repo-relative path to raw.githubusercontent.com URL."""
    encoded = "/".join(quote(p, safe="") for p in path.split("/"))
    return f"{REPO_RAW}/{encoded}"


def fetch_raw(path: str, retries=3) -> str | None:
    """Fetch text content from raw GitHub URL. Returns None on 404."""
    import time
    for attempt in range(retries):
        try:
            r = requests.get(raw_url(path), timeout=15)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.text
        except Exception as e:
            if attempt == retries - 1:
                print(f"fetch_raw error: {e}")
                return None
            time.sleep(2)
    return None


# Hard-coded scripture catalog (discovered from repo, avoids API rate limits)
SCRIPTURE_CATALOG = [
    # Dravyanuyog
    ("01_द्रव्यानुयोग", "01_समयसार--कुन्दकुन्दाचार्य"),
    ("01_द्रव्यानुयोग", "02_प्रवचनसार--कुन्दकुन्दाचार्य"),
    ("01_द्रव्यानुयोग", "05_पञ्चास्तिकाय--कुन्दकुन्दाचार्य"),
    ("01_द्रव्यानुयोग", "06_द्रव्यसंग्रह--नेमिचंद्र-सिद्धांतचक्रवर्ती"),
    ("01_द्रव्यानुयोग", "07_समाधितन्त्र--आचार्य‌-पूज्यपाद"),
    ("01_द्रव्यानुयोग", "08_स्वरूप-संबोधन--अकलंक-देव"),
    ("01_द्रव्यानुयोग", "09_इष्टोपदेश--आचार्य‌-पूज्यपाद"),
    ("01_द्रव्यानुयोग", "10_परमात्मप्रकाश--योगींदुदेव"),
    ("01_द्रव्यानुयोग", "12_योगसार-प्राभृत--अमितगति-आचार्य"),
    ("01_द्रव्यानुयोग", "13_तत्त्वार्थसूत्र--आचार्य-उमास्वामी"),
    ("01_द्रव्यानुयोग", "14_योगसार--योगींदुदेव"),
    ("01_द्रव्यानुयोग", "15_पंचाध्यायी"),
    ("01_द्रव्यानुयोग", "16_पाहुड-दोहा--राम-सिंह-मुनि"),
    ("01_द्रव्यानुयोग", "17_परम-अध्यात्म-तरंगिणी--अमृतचंद्राचार्य"),
    ("01_द्रव्यानुयोग", "18_तत्त्वज्ञान-तरंगिणी--भट्टारक-ज्ञानभूषण"),
    ("01_द्रव्यानुयोग", "19_तत्त्वसार--देवसेनाचार्य"),
    ("01_द्रव्यानुयोग", "19_सिद्धान्त-सार--भट्टारक-सकलकीर्ति"),
    ("01_द्रव्यानुयोग", "20_अमृताशीति--योगींदुदेव"),
    ("01_द्रव्यानुयोग", "21_तत्त्वसार--देवसेनाचार्य"),
    # Charananuyog
    ("02_चरणानुयोग", "01_नियमसार--कुन्दकुंदाचार्य"),
    ("02_चरणानुयोग", "02_श्रीअष्टपाहुड--कुन्दकुंदाचार्य"),
    ("02_चरणानुयोग", "03_मूलाचार--वट्टकेराचार्य"),
    ("02_चरणानुयोग", "04_वारासाणुवेक्खा--स्वामि-कार्तिकेय"),
    ("02_चरणानुयोग", "05_पुरुषार्थसिद्ध्युपाय--आ-अमृतचन्द्र"),
    ("02_चरणानुयोग", "06_बारसणुपेक्‍खा--कुन्दकुन्दाचार्य"),
    ("02_चरणानुयोग", "09_रत्नकरण्ड-श्रावकाचार--समन्तभद्राचार्य"),
    ("02_चरणानुयोग", "10_आराधनासार--देवसेनाचार्य"),
    ("02_चरणानुयोग", "11_दर्शनसार--देवसेनाचार्य"),
    ("02_चरणानुयोग", "12_ज्ञानार्णव--शुभचंद्राचार्य"),
    ("02_चरणानुयोग", "17_भगवती-आराधना--शिवाचार्य"),
    ("02_चरणानुयोग", "18_पद्मनंदी-पंचविन्शतिका--आ-पद्मनंदी"),
    ("02_चरणानुयोग", "19_आत्मानुशासन--आ-गुणभद्र"),
    ("02_चरणानुयोग", "20_रयणसार--कुन्दकुंदाचार्य"),
    ("02_चरणानुयोग", "21_उपासकाध्ययन--सोमदेवाचार्य"),
    # Karananuyog
    ("03_करणानुयोग", "01_लब्धिसार--नेमिचंद्र-आचार्य"),
    ("03_करणानुयोग", "02_गोम्मटसार-कर्मकांड--नेमिचंद्र-आचार्य"),
    ("03_करणानुयोग", "03_गोम्मटसार-जीवकांड--नेमिचंद्र-आचार्य"),
    ("03_करणानुयोग", "05_आस्रव-त्रिभंगी--श्रुतमुनी"),
    # Prathamanuyog
    ("05_प्रथमानुयोग", "01_आराधना-कथा-कोश--ब्र-नेमिदत्त"),
    ("05_प्रथमानुयोग", "04_पद्मपुराण--रविषेणाचार्य"),
    ("05_प्रथमानुयोग", "05_आदिपुराण--जिनसेनाचार्य"),
    ("05_प्रथमानुयोग", "20_सम्यक्त्व-कौमुदि"),
]


def discover_scriptures() -> list:
    scriptures = []
    for cat_dir, book_dir in SCRIPTURE_CATALOG:
        category = next((v for k, v in CATEGORY_MAP.items() if cat_dir.startswith(k)), "Other")
        m = re.match(r'^\d+_(.+?)(?:--(.+))?$', book_dir)
        title  = m.group(1).replace("-", " ").strip() if m else book_dir
        author = m.group(2).replace("-", " ").strip() if m and m.group(2) else ""
        scriptures.append({
            "dir_name": book_dir,
            "cat_dir":  cat_dir,
            "category": category,
            "path":     f"{SHASTRA_PATH}/{cat_dir}/{book_dir}",
            "title":    title,
            "author":   author,
            "book_id":  EXISTING_BOOK_IDS.get(book_dir),
        })
    return scriptures


def get_html_files(scripture_path: str) -> list:
    # index.txt in root lists filenames (may be .txt or .html — strip and add .html)
    content = fetch_raw(f"{scripture_path}/index.txt")
    if content:
        raw_files = [re.sub(r'\.(txt|html)$', '', l.strip()) + ".html"
                     for l in content.splitlines()
                     if l.strip() and l.strip() not in ("index.txt","index.html")]
        if raw_files:
            # Validate: check if first file actually exists in /html/
            probe = fetch_raw(f"{scripture_path}/html/{raw_files[0]}")
            if probe and "<html" in probe.lower():
                return sorted(raw_files)
            # File doesn't exist — scripture uses chapter-sutra naming (e.g. 01-01.html)
            # Fall through to chapter-sutra enumeration below

    # Chapter-sutra enumeration fallback (using GitHub API)
    files = []
    enc_path = "/".join(quote(p, safe="") for p in scripture_path.split("/"))
    api_url = f"https://api.github.com/repos/nikkyjain/nikkyjain.github.io/contents/{enc_path}/html"
    try:
        r = requests.get(api_url, timeout=15)
        if r.status_code == 200:
            return sorted([i["name"] for i in r.json() if i["name"].endswith(".html")])
    except Exception as e:
        print(f"API list error: {e}")
    return sorted(files)


def parse_filename(fname: str) -> tuple:
    """Returns (chapter, sutra_number, gatha_label)"""
    # Format: 07-01.html → ch=7, sutra=1
    m = re.match(r'^(\d+)-(\d+)\.html$', fname)
    if m:
        return int(m.group(1)), int(m.group(2)), f"{m.group(1)}.{m.group(2)}"
    # Format: 001.html → ch=0, sutra=1
    m2 = re.match(r'^0*(\d+)\.html$', fname)
    if m2:
        return 0, int(m2.group(1)), m2.group(1)
    return 0, 0, fname.replace(".html", "")


# ── Main import ───────────────────────────────────────────────────────────────
def import_scripture(scripture: dict, skip_if_done: bool = False) -> dict:
    title    = scripture["title"]
    author   = scripture["author"]
    category = scripture["category"]
    path     = scripture["path"]
    book_id  = scripture["book_id"]

    # Get or create Firestore doc
    if book_id:
        doc_ref = db.collection("scriptures").document(book_id)
    else:
        docs = list(db.collection("scriptures").where("title", "==", title).limit(1).stream())
        if docs:
            doc_ref = docs[0].reference
            book_id = doc_ref.id
            scripture["book_id"] = book_id
        else:
            doc_ref = db.collection("scriptures").document()
            book_id = doc_ref.id
            scripture["book_id"] = book_id

    existing = doc_ref.get().to_dict() or {}
    if skip_if_done and existing.get("status") == "ready" and existing.get("source") == "github-import":
        print(f"  ↺ Skip (already imported): {title}")
        return {"skipped": True}

    print(f"\n{'═'*60}")
    print(f"  Importing: {title}")
    print(f"  Author   : {author}")
    print(f"  Category : {category}")
    print(f"  Book ID  : {book_id}")

    files = get_html_files(path)
    if not files:
        print(f"  ✗ No HTML files found")
        return {"error": "no files"}

    print(f"  Files    : {len(files)}")
    pages_ref = doc_ref.collection("pages")

    imported, skipped, vectors = 0, 0, 0
    for page_num, fname in enumerate(files, 1):
        enc_path = "/".join(quote(p, safe="") for p in path.split("/"))
        raw_url = f"{REPO_RAW}/{enc_path}/html/{quote(fname, safe='')}"
        try:
            r = requests.get(raw_url, timeout=15)
            if r.status_code == 404:
                raw_url = f"{REPO_RAW}/{enc_path}/{quote(fname, safe='')}"
                r = requests.get(raw_url, timeout=15)
            r.raise_for_status()
        except Exception as e:
            skipped += 1
            continue

        parsed = parse_sutra_html(r.text)
        chapter, sutra_num, gatha_label = parse_filename(fname)

        lines = []
        if parsed["sutra"] and len(parsed["sutra"]) > 5:
            lines.append(parsed["sutra"])
        for seg in (parsed["meaning"] + " " + parsed["commentary"]).split(". "):
            seg = seg.strip()
            if len(seg) >= 20:
                lines.append(seg)
        lines = [l for l in lines if l]

        if not lines:
            skipped += 1
            continue

        # Firestore
        pages_ref.document(str(page_num)).set({
            "pageNumber":    page_num,
            "chapterNumber": chapter,
            "sutraNumber":   sutra_num,
            "lines":         lines,
            "source":        "github-import",
            "patchedAt":     _gfs.SERVER_TIMESTAMP,
        }, merge=True)

        # Qdrant vectors
        v = upsert_qdrant(
            book_id, page_num, chapter, sutra_num, gatha_label,
            lines, title, [category]
        )
        vectors += v
        imported += 1
        if imported % 50 == 0:
            print(f"    {imported}/{len(files)} imported, {vectors} vectors")
        time.sleep(0.25)

    # Update root Firestore doc
    doc_ref.set({
        "title":      title,
        "writer":     author,
        "categories": [category],
        "pageCount":  imported,
        "status":     "ready",
        "source":     "github-import",
        "processedAt": _gfs.SERVER_TIMESTAMP,
        "gcsPath":    existing.get("gcsPath", ""),
    }, merge=True)

    print(f"  ✓ {imported} pages, {vectors} vectors  (skipped: {skipped})")
    return {"imported": imported, "vectors": vectors, "book_id": book_id}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list",          action="store_true", help="List all scriptures without importing")
    ap.add_argument("--skip-existing", action="store_true", help="Skip books already imported from GitHub")
    ap.add_argument("--book",          help="Import specific book by Firestore ID")
    ap.add_argument("--dir",           help="Import specific dir name (partial match)")
    args = ap.parse_args()

    print("Discovering scriptures...")
    scriptures = discover_scriptures()
    print(f"Found {len(scriptures)} scriptures\n")

    if args.list:
        for s in scriptures:
            bid = s.get("book_id", "NEW")
            print(f"  [{s['category'][:4]}] {s['title']} — {s['author']} ({bid})")
        return

    # Filter
    if args.book:
        scriptures = [s for s in scriptures if s.get("book_id") == args.book]
    elif args.dir:
        scriptures = [s for s in scriptures if args.dir.lower() in s["dir_name"].lower()]

    total_imported = total_vectors = 0
    for s in scriptures:
        try:
            result = import_scripture(s, skip_if_done=args.skip_existing)
            if not result.get("skipped"):
                total_imported += result.get("imported", 0)
                total_vectors  += result.get("vectors", 0)
        except Exception as e:
            print(f"  ✗ Error importing {s['title']}: {e}")
            import traceback; traceback.print_exc()

    print(f"\n{'═'*60}")
    print(f"DONE — Total pages: {total_imported}  Total vectors: {total_vectors}")


if __name__ == "__main__":
    main()
