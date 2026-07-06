#!/usr/bin/env python3
"""
Scrape bhajan meanings (अर्थ) + writer attribution from forum.jinswara.com
(Discourse forum, category "content/bhakti", tag "meaning") and fuzz-match
them onto existing bhajans in Firestore (imported earlier from nikkyjain's
lyrics dataset).

Usage:
  python3 scripts/import-bhajan-meanings.py            # scrape + match + write
  python3 scripts/import-bhajan-meanings.py --list      # scrape + show matches only, no writes
"""

import os, re, time, argparse, unicodedata, difflib
from pathlib import Path
from html.parser import HTMLParser
import requests
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).parent.parent / ".env")
os.environ.update({k: v for k, v in env.items() if v})

PROJECT_ID   = os.environ["NEXT_PUBLIC_FIREBASE_PROJECT_ID"]
CLIENT_EMAIL = os.environ["NEXT_FILE_UPLOAD_CLIENT_EMAIL"]
PRIVATE_KEY  = os.environ["NEXT_FILE_UPLOAD_PRIVATE_KEY"].replace("\\n", "\n")

FORUM = "https://forum.jinswara.com"
UA = "Mozilla/5.0 (compatible; ask-aagam-import/1.0)"

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


class HtmlToText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "p"):
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def html_to_text(html: str) -> str:
    p = HtmlToText()
    p.feed(html)
    text = "".join(p.parts)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"[॥.।,\-–—:;!'\"()]", "", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def fetch_tag_topics(tag: str) -> list:
    topics, page = [], 0
    while True:
        r = requests.get(f"{FORUM}/tag/{tag}.json", params={"page": page},
                          headers={"User-Agent": UA}, timeout=20)
        r.raise_for_status()
        batch = r.json()["topic_list"]["topics"]
        if not batch:
            break
        topics.extend(batch)
        page += 1
        time.sleep(0.2)
    return topics


def fetch_topic(topic_id: int) -> dict | None:
    for attempt in range(5):
        try:
            r = requests.get(f"{FORUM}/t/{topic_id}.json", headers={"User-Agent": UA}, timeout=20)
            if r.status_code == 404:
                return None
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 10)) + attempt * 5
                print(f"    (rate limited on topic {topic_id}, waiting {wait}s)")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == 4:
                print(f"    ✗ fetch failed for topic {topic_id}: {e}")
                return None
            time.sleep(3)
    print(f"    ✗ gave up on topic {topic_id} after rate limiting")
    return None


WRITER_RE = re.compile(r"(?:रचयिता|Artist)\s*[-:]\s*([^\n<]+)")
# "अर्थ" section starts a new paragraph (post-<br>/<p> newline, or start of text)
MEANING_START_RE = re.compile(r"(?:^|\n)अर्थ\s*[:\-]*\s*", re.MULTILINE)
# Trailing metadata paragraphs that follow the meaning block, if present
MEANING_END_RE = re.compile(r"\n(?:सोर्स|स्रोत|रचयिता|Artist|Source)\s*[:\-]", re.MULTILINE)


def extract_meaning(text: str) -> str | None:
    m = MEANING_START_RE.search(text)
    if not m:
        return None
    rest = text[m.end():]
    end = MEANING_END_RE.search(rest)
    meaning = rest[: end.start()] if end else rest
    meaning = meaning.strip()
    return meaning or None


def parse_topic(topic_json: dict) -> dict | None:
    title_raw = topic_json["title"]
    # Titles are "<Hindi lyrics opener><separator><Latin transliteration>" —
    # separator varies (|, ।, l) so just cut at the first Latin letter instead.
    m = re.search(r"[A-Za-z]", title_raw)
    title = (title_raw[: m.start()] if m else title_raw)
    title = re.sub(r"[|।lL]+\s*$", "", title.strip()).strip()

    posts = topic_json["post_stream"]["posts"]
    if not posts:
        return None

    post1_text = html_to_text(posts[0]["cooked"])

    writer_match = WRITER_RE.search(post1_text)
    writer = writer_match.group(1).strip() if writer_match else None

    # Meaning is either embedded in post 1 (after lyrics) or in a later reply
    meaning = extract_meaning(post1_text)
    if not meaning:
        for p in posts[1:]:
            text = html_to_text(p["cooked"])
            meaning = extract_meaning(text)
            if not meaning and re.match(r"^\s*अर्थ\b", text):
                meaning = re.sub(r"^\s*अर्थ\s*[:\-]*\s*", "", text).strip()
            if meaning:
                break

    if not meaning:
        return None

    return {"title": title, "writer": writer, "meaning": meaning}


def build_bhajan_index():
    """title (normalized) -> list of (doc_id, original_title)"""
    index = {}
    for doc in db.collection("bhajans").stream():
        data = doc.to_dict()
        norm = normalize(data.get("title", ""))
        index.setdefault(norm, []).append((doc.id, data.get("title", "")))
    return index


def match_title(title: str, index: dict) -> str | None:
    norm = normalize(title)
    if norm in index:
        return index[norm][0][0]
    close = difflib.get_close_matches(norm, index.keys(), n=1, cutoff=0.87)
    if close:
        return index[close[0]][0][0]
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="Scrape + show matches only, no Firestore writes")
    args = ap.parse_args()

    print("Fetching topic list from forum (tag=meaning)...")
    topics = fetch_tag_topics("meaning")
    print(f"  {len(topics)} topics tagged 'meaning'")

    print("Building bhajan title index from Firestore...")
    index = build_bhajan_index()
    print(f"  {len(index)} unique titles indexed")

    matched, unmatched, updated = 0, 0, 0
    for t in topics:
        topic_json = fetch_topic(t["id"])
        if not topic_json:
            continue
        parsed = parse_topic(topic_json)
        if not parsed:
            continue

        doc_id = match_title(parsed["title"], index)
        if not doc_id:
            unmatched += 1
            print(f"  ✗ no match: {parsed['title']}")
            continue

        matched += 1
        print(f"  ✓ matched: {parsed['title']} -> {doc_id}" + (f"  (writer: {parsed['writer']})" if parsed["writer"] else ""))

        if not args.list:
            update = {"meaning": parsed["meaning"], "meaningSource": "forum.jinswara.com"}
            if parsed["writer"]:
                update["writer"] = parsed["writer"]
            db.collection("bhajans").document(doc_id).set(update, merge=True)
            updated += 1

        time.sleep(1.0)

    print(f"\nDone. matched={matched} unmatched={unmatched} updated={updated}")


if __name__ == "__main__":
    main()
