#!/usr/bin/env python3
"""
The original nikkyjain lyrics scrape bundled an "अर्थ:" (meaning) explanation
directly into the lyrics text for ~397 bhajans. That duplicates the separate
`meaning` field/card we now render, showing the same explanation twice.

This splits it out: strips the embedded meaning from `lyrics`, and promotes
it to the `meaning` field for bhajans that don't already have one from the
forum.jinswara.com import (that source is kept — it's cleaner/curated).

Usage:
  python3 scripts/cleanup-embedded-meaning.py          # write changes
  python3 scripts/cleanup-embedded-meaning.py --list   # dry run
"""
import os, re, argparse
from pathlib import Path
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).parent.parent / ".env")
os.environ.update({k: v for k, v in env.items() if v})

PROJECT_ID   = os.environ["NEXT_PUBLIC_FIREBASE_PROJECT_ID"]
CLIENT_EMAIL = os.environ["NEXT_FILE_UPLOAD_CLIENT_EMAIL"]
PRIVATE_KEY  = os.environ["NEXT_FILE_UPLOAD_PRIVATE_KEY"].replace("\\n", "\n")

from google.cloud import firestore as _gfs
from google.oauth2 import service_account as _svc

sa_info = {
    "type": "service_account", "project_id": PROJECT_ID,
    "client_email": CLIENT_EMAIL, "private_key": PRIVATE_KEY,
    "token_uri": "https://oauth2.googleapis.com/token",
}
creds = _svc.Credentials.from_service_account_info(
    sa_info, scopes=["https://www.googleapis.com/auth/cloud-platform",
                     "https://www.googleapis.com/auth/datastore"])
db = _gfs.Client(project=PROJECT_ID, credentials=creds)

MEANING_START_RE = re.compile(r"\n*अर्थ\s*[:\-]*\s*", re.MULTILINE)
MEANING_END_RE = re.compile(r"\n(?:सोर्स|स्रोत|रचयिता|Artist|Source)\s*[:\-]", re.MULTILINE)
WRITER_RE = re.compile(r"(?:रचयिता|Artist)\s*[-:]\s*([^\n<]+)")


def split_lyrics(lyrics: str):
    m = MEANING_START_RE.search(lyrics)
    if not m:
        return None
    clean_lyrics = lyrics[: m.start()].rstrip()
    rest = lyrics[m.end():]
    end = MEANING_END_RE.search(rest)
    meaning = (rest[: end.start()] if end else rest).strip()
    writer_match = WRITER_RE.search(rest)
    writer = writer_match.group(1).strip() if writer_match else None
    return clean_lyrics, meaning, writer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    cleaned, promoted, writer_added = 0, 0, 0
    for doc in db.collection("bhajans").stream():
        data = doc.to_dict()
        lyrics = data.get("lyrics", "")
        result = split_lyrics(lyrics)
        if not result:
            continue
        clean_lyrics, embedded_meaning, embedded_writer = result
        if not clean_lyrics or not embedded_meaning:
            continue

        update = {"lyrics": clean_lyrics}
        will_promote = not data.get("meaning")
        if will_promote:
            update["meaning"] = embedded_meaning
            update["meaningSource"] = "nikkyjain-embedded"
        if embedded_writer and not data.get("writer"):
            update["writer"] = embedded_writer

        cleaned += 1
        if will_promote:
            promoted += 1
        if embedded_writer and not data.get("writer"):
            writer_added += 1

        print(f"  {'[dry] ' if args.list else ''}{doc.id}"
              f"{'  +meaning' if will_promote else '  (kept forum meaning)'}"
              f"{'  +writer' if embedded_writer and not data.get('writer') else ''}")

        if not args.list:
            doc.reference.set(update, merge=True)

    print(f"\nDone. cleaned_lyrics={cleaned} meaning_promoted={promoted} writer_added={writer_added}")


if __name__ == "__main__":
    main()
