#!/usr/bin/env python3
"""
"selected" is nikkyjain's own curation folder (50_selected), not a real
category — it just duplicated bhajans that already live under a proper
category (देव, अध्यात्म, पं ...-कृत, etc). After dedup-bhajans.py merged
duplicates, "selected" ended up sitting in the `categories` array alongside
the real category, which is meaningless to show as a badge.

This strips "selected" from any doc that has another real category, and
flags (does not silently delete) any doc where "selected" was the ONLY
category — those need manual review since they have no other home.

Usage:
  python3 scripts/cleanup-selected-category.py          # write changes
  python3 scripts/cleanup-selected-category.py --list   # dry run
"""
import os, argparse
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    stripped, flagged = 0, []
    for doc in db.collection("bhajans").stream():
        data = doc.to_dict()
        cats = data.get("categories") or [data.get("category")]
        if "selected" not in cats:
            continue

        remaining = [c for c in cats if c and c != "selected"]
        if not remaining:
            flagged.append((doc.id, data.get("title"), data.get("lyrics", "")[:80]))
            continue

        update = {"categories": remaining, "category": remaining[0]}
        print(f"  {'[dry] ' if args.list else ''}{doc.id}: {cats} -> {remaining}")
        if not args.list:
            doc.reference.set(update, merge=True)
        stripped += 1

    print(f"\nDone. stripped={stripped}")
    if flagged:
        print(f"\nFlagged for manual review ({len(flagged)}) — 'selected' was their ONLY category:")
        for doc_id, title, lyrics_preview in flagged:
            print(f"  {doc_id} | {title} | lyrics preview: {lyrics_preview!r}")


if __name__ == "__main__":
    main()
