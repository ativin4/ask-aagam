#!/usr/bin/env python3
"""
Backfill `writer` on bhajans whose category name itself names the composer
(e.g. "पं दौलतराम कृत" = "composed by Pandit Daulatram"). Categories without
a "-कृत" suffix (देव, शास्त्र, selected, etc.) don't indicate a specific writer
and are left alone. Does not overwrite writer already set (e.g. by the
forum-meaning import, which has more precise per-bhajan attribution).
"""
import os
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


def writer_from_category(category: str) -> str | None:
    if category.endswith("कृत"):
        return category[: -len("कृत")].strip()
    return None


def main():
    updated, skipped_existing, skipped_generic = 0, 0, 0
    for doc in db.collection("bhajans").stream():
        data = doc.to_dict()
        if data.get("writer"):
            skipped_existing += 1
            continue
        writer = writer_from_category(data.get("category", ""))
        if not writer:
            skipped_generic += 1
            continue
        doc.reference.update({"writer": writer})
        updated += 1
        if updated % 100 == 0:
            print(f"  {updated} updated")

    print(f"\nDone. updated={updated} skipped_existing={skipped_existing} skipped_generic_category={skipped_generic}")


if __name__ == "__main__":
    main()
