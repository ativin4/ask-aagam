#!/usr/bin/env python3
"""
Import Tatvarthsutra from GitHub (nikkyjain/nikkyjain.github.io) directly into
Firestore + Qdrant, bypassing OCR entirely.
Each HTML file = one sutra → one Firestore "page" + Qdrant vectors.

Usage:
  python3 scripts/import-tatvarthsutra-github.py
"""

import os, re, json, uuid, time
import requests
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

BOOK_ID          = "fSCWmgxK6r4HBMMthX5M"
QDRANT_COLLECTION = "scripture_pages"
HF_EMBED_API     = "https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large"

BASE_URL = (
    "https://raw.githubusercontent.com/nikkyjain/nikkyjain.github.io/main"
    "/jainDataBase/shastra/01_%E0%A4%A6%E0%A5%8D%E0%A4%B0%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%BE"
    "%E0%A4%A8%E0%A5%81%E0%A4%AF%E0%A5%8B%E0%A4%97/13_%E0%A4%A4%E0%A4%A4%E0%A5%8D%E0%A4%A4%E0%A5%8D"
    "%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%A5%E0%A4%B8%E0%A5%82%E0%A4%A4%E0%A5%8D%E0%A4%B0--"
    "%E0%A4%86%E0%A4%9A%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%AF-%E0%A4%89%E0%A4%AE%E0%A4%BE%E0%A4%B8%E0%A5%8D"
    "%E0%A4%B5%E0%A4%BE%E0%A4%AE%E0%A5%80/html"
)

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


class SutraParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current_class = None
        self.gatha = []
        self.paragraph = []
        self.teeka = []
        self._buf = []
        self._in_target = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        cls = attrs_dict.get("class", "")
        if cls in ("gatha", "paragraph", "paragraphE", "teeka"):
            self.current_class = cls
            self._in_target = True
            self._buf = []

    def handle_endtag(self, tag):
        if self._in_target and tag == "div":
            text = re.sub(r'\s+', ' ', "".join(self._buf)).strip()
            text = re.sub(r'<[^>]+>', '', text)  # strip any nested tags
            text = text.replace('​', '').replace('﻿', '').strip()
            if self.current_class == "gatha":
                self.gatha.append(text)
            elif self.current_class in ("paragraph", "paragraphE"):
                self.paragraph.append(text)
            elif self.current_class == "teeka":
                self.teeka.append(text)
            self._in_target = False
            self.current_class = None

    def handle_data(self, data):
        if self._in_target:
            self._buf.append(data)

    def handle_entityref(self, name):
        if self._in_target:
            self._buf.append(f"&{name};")


def clean(text: str) -> str:
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def parse_sutra_html(html: str) -> dict:
    parser = SutraParser()
    parser.feed(html)
    return {
        "sutra": clean(" ".join(parser.gatha)),
        "meaning": clean(" ".join(parser.paragraph)),
        "commentary": clean(" ".join(parser.teeka[:2])),  # first 2 teekas
    }


def embed_texts(texts: list) -> list:
    resp = requests.post(
        HF_EMBED_API,
        headers={"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"},
        json={"inputs": [f"passage: {t}" for t in texts]},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def upsert_qdrant(book_id, page_num, chapter, sutra_num, lines, title):
    headers = {"api-key": QDRANT_KEY, "Content-Type": "application/json"}
    # Delete old vectors for this page
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
        requests.post(
            f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points/delete",
            headers=headers, json={"points": old_ids}, timeout=30,
        )

    valid = [l for l in lines if l.strip() and len(l.strip()) >= 15]
    if not valid:
        return
    vectors = embed_texts(valid)
    requests.put(
        f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points",
        headers=headers,
        json={"points": [
            {
                "id": str(uuid.uuid4()), "vector": vectors[j],
                "payload": {
                    "book_id": book_id, "book_title": title,
                    "categories": ["Dravyanuyog"],
                    "page_number": page_num,
                    "para_number": j,
                    "line_number": 0,
                    "chapter_number": chapter,
                    "gatha_number": str(sutra_num),
                    "preview": valid[j][:400],
                },
            }
            for j in range(len(valid))
        ]},
        timeout=30,
    ).raise_for_status()


def get_file_list():
    url = (
        "https://api.github.com/repos/nikkyjain/nikkyjain.github.io/contents"
        "/jainDataBase/shastra/01_%E0%A4%A6%E0%A5%8D%E0%A4%B0%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%BE"
        "%E0%A4%A8%E0%A5%81%E0%A4%AF%E0%A5%8B%E0%A4%97/13_%E0%A4%A4%E0%A4%A4%E0%A5%8D%E0%A4%A4%E0%A5%8D"
        "%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%A5%E0%A4%B8%E0%A5%82%E0%A4%A4%E0%A5%8D%E0%A4%B0--"
        "%E0%A4%86%E0%A4%9A%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%AF-%E0%A4%89%E0%A4%AE%E0%A4%BE%E0%A4%B8%E0%A5%8D"
        "%E0%A4%B5%E0%A4%BE%E0%A4%AE%E0%A5%80/html"
    )
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return [f["name"] for f in r.json() if f["name"].endswith(".html") and f["name"] != "index.html"]


def main():
    title = "Tatvarthsutra"
    files = sorted(get_file_list())
    # Parse chapter-sutra from filename like "07-01.html"
    sutra_files = []
    page_num = 0
    for fname in files:
        m = re.match(r'^(\d+)-(\d+)\.html$', fname)
        if m:
            ch, su = int(m.group(1)), int(m.group(2))
            page_num += 1
            sutra_files.append((page_num, ch, su, fname))
        elif fname.startswith("000_"):
            page_num += 1
            sutra_files.append((page_num, 0, 0, fname))

    print(f"Total sutras to import: {len(sutra_files)}")
    pages_ref = db.collection("scriptures").document(BOOK_ID).collection("pages")
    errors = []

    for page_num, chapter, sutra_num, fname in sutra_files:
        url = f"{BASE_URL}/{fname}"
        try:
            r = requests.get(url, timeout=15)
            r.raise_for_status()
            parsed = parse_sutra_html(r.text)

            lines = []
            if parsed["sutra"]:
                lines.append(parsed["sutra"])
            if parsed["meaning"]:
                lines.extend([l.strip() for l in parsed["meaning"].split(".") if len(l.strip()) > 20])
            if parsed["commentary"]:
                lines.extend([l.strip() for l in parsed["commentary"].split(".") if len(l.strip()) > 20])

            lines = [l for l in lines if l]
            if not lines:
                print(f"  p.{page_num} ({fname}): empty — skip")
                continue

            # Firestore
            pages_ref.document(str(page_num)).set({
                "pageNumber": page_num,
                "chapterNumber": chapter,
                "sutraNumber": sutra_num,
                "lines": lines,
                "source": "github-import",
                "patchedAt": _gfs.SERVER_TIMESTAMP,
            }, merge=True)

            # Qdrant
            upsert_qdrant(BOOK_ID, page_num, chapter, sutra_num, lines, title)

            print(f"  p.{page_num} ch.{chapter}.{sutra_num} ({len(lines)} segments) → saved")
            time.sleep(0.3)  # rate limit HF API

        except Exception as e:
            print(f"  p.{page_num} ({fname}): ERROR {e}")
            errors.append((fname, str(e)))

    # Update Firestore root doc
    db.collection("scriptures").document(BOOK_ID).update({
        "pageCount": len(sutra_files),
        "status": "ready",
        "processedAt": _gfs.SERVER_TIMESTAMP,
        "source": "github-import",
    })

    print(f"\n{'─'*50}")
    print(f"Done. Imported: {len(sutra_files)-len(errors)}  Errors: {len(errors)}")
    for f, e in errors:
        print(f"  {f}: {e}")


if __name__ == "__main__":
    main()
