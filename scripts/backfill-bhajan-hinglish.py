#!/usr/bin/env python3
"""One-off: add title_hinglish to bhajans docs written before that field existed."""
import os, re, unicodedata
from pathlib import Path
from dotenv import dotenv_values
from indic_transliteration import sanscript

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


def to_hinglish(s: str) -> str:
    iast = sanscript.transliterate(s, sanscript.DEVANAGARI, sanscript.IAST)
    ascii_str = "".join(c for c in unicodedata.normalize("NFKD", iast) if not unicodedata.combining(c))
    return re.sub(r'[~.]', '', ascii_str).lower().strip()


def main():
    updated = 0
    for doc in db.collection("bhajans").stream():
        data = doc.to_dict()
        if data.get("title_hinglish") or not data.get("title"):
            continue
        doc.reference.update({"title_hinglish": to_hinglish(data["title"])})
        updated += 1
        if updated % 100 == 0:
            print(f"  {updated} updated")
    print(f"Done. {updated} docs backfilled.")


if __name__ == "__main__":
    main()
