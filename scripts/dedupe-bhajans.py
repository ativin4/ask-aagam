#!/usr/bin/env python3
"""
nikkyjain's source files the same bhajan under multiple category folders
(e.g. by deity/tone AND by author) — our import created a separate Firestore
doc per folder, so ~625 of 1461 docs are exact-lyrics duplicates of another
doc under a different slug/category. That's duplicate content across public
URLs (bad for SEO — competing pages, split link equity) and shows the same
song twice on /bhajans.

This groups bhajans by normalized full lyrics text (exact match), picks one
canonical doc per group (preferring one that already has a `meaning`, then
one with a `writer`), merges in any `meaning`/`writer` found on the other
copies, records every category the bhajan appeared under as `categories`,
then deletes the non-canonical docs.

Usage:
  python3 scripts/dedupe-bhajans.py          # write changes
  python3 scripts/dedupe-bhajans.py --list   # dry run
"""
import os, re, argparse, unicodedata
from pathlib import Path
from collections import defaultdict
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


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"[^\wऀ-ॿ]", "", s)
    return s.lower()


def pick_canonical(members: list) -> dict:
    def score(m):
        return (1 if m["data"].get("meaning") else 0, 1 if m["data"].get("writer") else 0, len(m["data"].get("lyrics", "")))
    return max(members, key=score)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    print("Loading all bhajans...")
    groups = defaultdict(list)
    for doc in db.collection("bhajans").stream():
        data = doc.to_dict()
        key = norm(data.get("lyrics", ""))
        if len(key) < 20:
            continue
        groups[key].append({"id": doc.id, "ref": doc.reference, "data": data})

    dupe_groups = [g for g in groups.values() if len(g) > 1]
    print(f"{len(dupe_groups)} duplicate groups, {sum(len(g) for g in dupe_groups)} docs involved")

    deleted, merged = 0, 0
    for group in dupe_groups:
        canonical = pick_canonical(group)
        others = [m for m in group if m["id"] != canonical["id"]]

        meaning = canonical["data"].get("meaning") or next((m["data"].get("meaning") for m in others if m["data"].get("meaning")), None)
        writer = canonical["data"].get("writer") or next((m["data"].get("writer") for m in others if m["data"].get("writer")), None)
        categories = sorted({m["data"].get("category", "") for m in group if m["data"].get("category")})

        update = {"categories": categories}
        if meaning:
            update["meaning"] = meaning
        if writer:
            update["writer"] = writer

        print(f"  canonical={canonical['id']}  categories={categories}  -> delete {[o['id'] for o in others]}")

        if not args.list:
            canonical["ref"].set(update, merge=True)
            for o in others:
                o["ref"].delete()

        merged += 1
        deleted += len(others)

    print(f"\nDone. groups_merged={merged} docs_deleted={deleted}")


if __name__ == "__main__":
    main()
