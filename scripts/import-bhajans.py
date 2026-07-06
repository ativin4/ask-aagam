#!/usr/bin/env python3
"""
Import Jain bhajans from nikkyjain/nikkyjain.github.io into Firestore ("bhajans" collection).
Text/lyrics only (no audio) — powers public SEO pages at /bhajan/[slug].

Usage:
  python3 scripts/import-bhajans.py              # import all categories
  python3 scripts/import-bhajans.py --list       # list categories + file counts, no writes
  python3 scripts/import-bhajans.py --category "01_देव"   # import one category
  python3 scripts/import-bhajans.py --skip-existing       # skip bhajans already in Firestore
"""

import os, re, sys, time, argparse
import requests
from urllib.parse import quote
from pathlib import Path
from html.parser import HTMLParser
from dotenv import dotenv_values
from indic_transliteration import sanscript

env = dotenv_values(Path(__file__).parent.parent / ".env")
os.environ.update({k: v for k, v in env.items() if v})

PROJECT_ID   = os.environ["NEXT_PUBLIC_FIREBASE_PROJECT_ID"]
CLIENT_EMAIL = os.environ["NEXT_FILE_UPLOAD_CLIENT_EMAIL"]
PRIVATE_KEY  = os.environ["NEXT_FILE_UPLOAD_PRIVATE_KEY"].replace("\\n", "\n")

REPO_API = "https://api.github.com/repos/nikkyjain/nikkyjain.github.io/contents"
REPO_RAW = "https://raw.githubusercontent.com/nikkyjain/nikkyjain.github.io/main"
BHAJAN_PATH = "jainDataBase/bhajans"

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


# ── Category catalog (avoids repeated top-level API calls) ────────────────────
CATEGORIES = [
    "01_देव", "02_शास्त्र", "03_गुरु", "04_धर्म", "05_तीर्थ", "06_कल्याणक",
    "07_महामंत्र", "08_अध्यात्म", "09_पं-दौलतराम-कृत", "10_पं-भागचंद-कृत",
    "11_पं-द्यानतराय-कृत", "12_पं-सौभाग्यमल-कृत", "13_पं-भूधरदास-कृत",
    "14_पं-बुधजन-कृत", "15_पं-मंगतराय-कृत", "16_पं-न्यामतराय-कृत",
    "17_पं-बनारसीदास-कृत", "18_पं-ज्ञानानन्द-कृत", "19_पं-नयनानन्द-कृत",
    "20_पं-मख्खनलाल-कृत", "21_पं-बुध-महाचन्द्र", "22_सहजानन्द-वर्णी",
    "24_पर्व", "25_चौबीस-तीर्थंकर", "26_नेमिनाथ-भगवान", "29_बाहुबली-भगवान",
    "32_दस-धर्म", "36_बच्चों-के-भजन", "41_मारवाड़ी", "50_selected",
]


def category_label(cat_dir: str) -> str:
    return re.sub(r'^\d+_', '', cat_dir).replace("-", " ")


def to_hinglish(s: str) -> str:
    """Rough Devanagari -> plain-ASCII Hinglish, for fuzzy search matching (not display)."""
    import unicodedata
    iast = sanscript.transliterate(s, sanscript.DEVANAGARI, sanscript.IAST)
    ascii_str = "".join(c for c in unicodedata.normalize("NFKD", iast) if not unicodedata.combining(c))
    return re.sub(r'[~.]', '', ascii_str).lower().strip()


def slugify(title: str) -> str:
    s = title.strip().replace(" ", "-")
    s = re.sub(r'[^\w\-ऀ-ॿ]', '', s)
    return s.strip("-")[:150] or "bhajan"


def list_html_files(cat_dir: str) -> list:
    enc = "/".join(quote(p, safe="") for p in f"{BHAJAN_PATH}/{cat_dir}/html".split("/"))
    r = requests.get(f"{REPO_API}/{enc}", timeout=20)
    if r.status_code != 200:
        print(f"  ✗ list error {cat_dir}: HTTP {r.status_code}")
        return []
    return [i["name"] for i in r.json() if i["name"].endswith(".html")]


def fetch_raw(cat_dir: str, fname: str, retries=3) -> str | None:
    enc = "/".join(quote(p, safe="") for p in f"{BHAJAN_PATH}/{cat_dir}/html/{fname}".split("/"))
    url = f"{REPO_RAW}/{enc}"
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.text
        except Exception:
            if attempt == retries - 1:
                return None
            time.sleep(2)
    return None


# ── Parse "div class=main" (title) + "div class=pooja" (lyrics) ───────────────
class BhajanParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.main, self.pooja = [], []
        self._target, self._depth, self._buf = None, 0, []

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        cls = attrs_d.get("class", "")
        if not self._target and tag == "div" and cls in ("main", "pooja"):
            self._target, self._depth, self._buf = cls, 1, []
        elif self._target and tag == "div":
            self._depth += 1
        elif self._target and tag == "br":
            self._buf.append("\n")

    def handle_startendtag(self, tag, attrs):
        if self._target and tag == "br":
            self._buf.append("\n")

    def handle_endtag(self, tag):
        if self._target and tag == "br":
            self._buf.append("\n")
        elif self._target and tag == "div":
            self._depth -= 1
            if self._depth == 0:
                text = "".join(self._buf)
                (self.main if self._target == "main" else self.pooja).append(text)
                self._target = None

    def handle_data(self, data):
        if self._target:
            self._buf.append(data)


def clean_text(s: str) -> str:
    s = s.replace("﻿", "").replace("​", "")
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()


def parse_bhajan(html: str) -> dict | None:
    # Files sometimes concatenate two documents; parse only the LAST one (matches actual filename/content)
    parts = re.split(r'(?=<!DOCTYPE html>)', html)
    html = parts[-1] if len(parts) > 1 else html

    p = BhajanParser()
    p.feed(html)
    title = clean_text(p.main[0]) if p.main else None
    lyrics = clean_text(p.pooja[0]) if p.pooja else ""
    if not title or not lyrics:
        return None
    return {"title": title, "lyrics": lyrics}


def import_category(cat_dir: str, skip_existing: bool = False) -> dict:
    label = category_label(cat_dir)
    files = list_html_files(cat_dir)
    print(f"\n{'═'*60}\n  Category: {label}  ({len(files)} files)")

    imported, skipped, failed = 0, 0, 0
    coll = db.collection("bhajans")
    for fname in files:
        title_guess = fname[:-5]
        doc_id = slugify(title_guess) + "--" + slugify(label)
        doc_ref = coll.document(doc_id)

        if skip_existing and doc_ref.get().exists:
            skipped += 1
            continue

        html = fetch_raw(cat_dir, fname)
        if not html:
            failed += 1
            continue

        parsed = parse_bhajan(html)
        if not parsed:
            failed += 1
            continue

        doc_ref.set({
            "title":          parsed["title"],
            "title_hinglish": to_hinglish(parsed["title"]),
            "lyrics":         parsed["lyrics"],
            "category":       label,
            "slug":           doc_id,
            "source":         "nikkyjain-github-import",
            "importedAt":     _gfs.SERVER_TIMESTAMP,
        }, merge=True)
        imported += 1
        if imported % 25 == 0:
            print(f"    {imported}/{len(files)} imported")
        time.sleep(0.15)

    print(f"  ✓ {imported} imported, {skipped} skipped, {failed} failed")
    return {"imported": imported, "skipped": skipped, "failed": failed}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="List categories + file counts, no writes")
    ap.add_argument("--category", help="Import one category only (exact dir name, e.g. '01_देव')")
    ap.add_argument("--skip-existing", action="store_true", help="Skip bhajans already in Firestore")
    args = ap.parse_args()

    cats = [args.category] if args.category else CATEGORIES

    if args.list:
        total = 0
        for c in cats:
            files = list_html_files(c)
            total += len(files)
            print(f"{category_label(c):30s} {len(files):4d} files")
            time.sleep(0.3)
        print(f"\nTotal: {total} files across {len(cats)} categories")
        return

    totals = {"imported": 0, "skipped": 0, "failed": 0}
    for c in cats:
        r = import_category(c, skip_existing=args.skip_existing)
        for k in totals:
            totals[k] += r[k]

    print(f"\n{'='*60}\nDONE. Imported {totals['imported']}, skipped {totals['skipped']}, failed {totals['failed']}")


if __name__ == "__main__":
    main()
