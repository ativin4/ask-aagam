#!/usr/bin/env python3
"""Rebuild scripture search passages from Firestore into Qdrant.

This is the safe migration path for the existing corpus. It replaces broad
page-level vectors with clean, paragraph-sized vectors while preserving page,
paragraph, chapter and gatha metadata used by Ask Aagam citations.

Examples:
  python3 scripts/reindex-scriptures.py --book M8jEdTElAaFwT0FbMtAl
  python3 scripts/reindex-scriptures.py --book M8jEdTElAaFwT0FbMtAl --from 1 --to 50
  python3 scripts/reindex-scriptures.py --all --dry-run
"""

import argparse
import os
import re
import sys
import time
import uuid
from pathlib import Path

import requests
from dotenv import dotenv_values
from google.cloud import firestore as gfs
from google.oauth2 import service_account


env = dotenv_values(Path(__file__).parent.parent / ".env")
os.environ.update({key: value for key, value in env.items() if value})

PROJECT_ID = os.environ["NEXT_PUBLIC_FIREBASE_PROJECT_ID"]
CLIENT_EMAIL = os.environ["NEXT_FILE_UPLOAD_CLIENT_EMAIL"]
PRIVATE_KEY = os.environ["NEXT_FILE_UPLOAD_PRIVATE_KEY"].replace("\\n", "\n")
QDRANT_URL = os.environ["QDRANT_URL"].rstrip("/")
QDRANT_KEY = os.environ["QDRANT_API_KEY"]
HF_TOKEN = os.environ["HF_TOKEN"]

COLLECTION = "scripture_pages"
HF_API = "https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large"
EMBED_BATCH = 24
UPSERT_BATCH = 64
MAX_PASSAGE_CHARS = 900

credentials = service_account.Credentials.from_service_account_info(
    {
        "type": "service_account",
        "project_id": PROJECT_ID,
        "client_email": CLIENT_EMAIL,
        "private_key": PRIVATE_KEY,
        "token_uri": "https://oauth2.googleapis.com/token",
    },
    scopes=["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/datastore"],
)
db = gfs.Client(project=PROJECT_ID, credentials=credentials)
session = requests.Session()
QDRANT_HEADERS = {"api-key": QDRANT_KEY, "Content-Type": "application/json"}


def clean_text(text: str) -> str:
    """Remove known generation/OCR wrappers, leaving scripture text untouched."""
    text = text or ""
    patterns = [
        (r"^here is the (?:corrected and )?refined text[^:]*:\s*(?:(?:corrected|refined)\s+text:\s*)?", ""),
        (r"^(?:corrected|refined)\s+text:\s*", ""),
        (r"(?:version\s+\S+:\s*)?remember\s+to\s+check\s+\S+[\s\S]*?(?:updares?|updates?)\s*", ""),
        (r"^version\s+[^:\n]+:\s*", ""),
        (r"\n?\*?\s*notes on (?:corrections|refinements)[\s\S]*", ""),
        (r"\n?\*?\s*(?:transliteration|english (?:interpretation|translation))[/\w\s]*:[\s\S]*", ""),
        (r"\(Note:[^)]*\)", ""),
        (r"^Stanza\s+[\w०-९]+\s*\n?", ""),
    ]
    for pattern, replacement in patterns:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r"https?://\S+|(?:www)\.\S+", "", text, flags=re.IGNORECASE)
    return text.replace("\u200b", "").replace("\ufeff", "").strip()


def split_long(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    sentences = [part.strip() for part in re.split(r"(?<=[।॥.!?])\s+", text) if part.strip()]
    result, current = [], ""
    for sentence in sentences:
        if len(sentence) > max_chars:
            if current:
                result.append(current)
                current = ""
            result.extend(sentence[start:start + max_chars] for start in range(0, len(sentence), max_chars))
        elif not current:
            current = sentence
        elif len(current) + len(sentence) + 1 <= max_chars:
            current += " " + sentence
        else:
            result.append(current)
            current = sentence
    if current:
        result.append(current)
    return result


def split_passages(lines: object, max_chars: int = MAX_PASSAGE_CHARS) -> list[str]:
    """Turn stored lines into compact, searchable passages with stable order."""
    if not isinstance(lines, list):
        return []
    blocks, pending = [], []

    def flush_block():
        nonlocal pending
        block = clean_text(" ".join(pending))
        if block:
            blocks.append(block)
        pending = []

    for value in lines:
        if not isinstance(value, str):
            continue
        for paragraph in re.split(r"\n\s*\n+", value):
            cleaned = clean_text(paragraph)
            if cleaned:
                pending.append(cleaned)
            else:
                flush_block()
    flush_block()

    passages, current = [], ""
    for block in blocks:
        for piece in split_long(block, max_chars):
            if not current:
                current = piece
            elif len(current) + len(piece) + 1 <= max_chars:
                current += " " + piece
            else:
                passages.append(current)
                current = piece
    if current:
        passages.append(current)
    return passages


DEVA_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
GATHA_RE = re.compile(r"[।॥]{1,2}\s*([०-९0-9]{1,4})\s*[।॥]{1,2}")
CHAPTER_RE = re.compile(r"(?:अध्याय|Chapter|प्रकरण|परिच्छेद)\s*[.:]?\s*([०-९0-9]+)", re.IGNORECASE)


def passage_metadata(text: str, page: dict) -> dict:
    gathas = sorted({int(match.group(1).translate(DEVA_DIGITS)) for match in GATHA_RE.finditer(text)})
    chapter_match = CHAPTER_RE.search(text)
    chapter = int(chapter_match.group(1).translate(DEVA_DIGITS)) if chapter_match else page.get("chapterNumber")
    meta = {"chapter_number": chapter} if chapter else {}
    if gathas:
        meta["gatha_number"] = str(gathas[0])
        meta["gatha_range"] = str(gathas[0]) if len(gathas) == 1 else f"{gathas[0]}–{gathas[-1]}"
    elif page.get("sutraNumber"):
        meta["gatha_number"] = str(page["sutraNumber"])
    return meta


def embed(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), EMBED_BATCH):
        batch = texts[start:start + EMBED_BATCH]
        for attempt in range(4):
            try:
                response = session.post(
                    HF_API,
                    headers={"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"},
                    json={"inputs": [f"passage: {text}" for text in batch]},
                    timeout=90,
                )
            except requests.RequestException as error:
                if attempt == 3:
                    raise RuntimeError(f"HF embedding connection failed: {error}") from error
                wait = 5 * (attempt + 1)
                print(f"    HF connection reset; retrying in {wait}s", flush=True)
                time.sleep(wait)
                continue
            if response.ok:
                payload = response.json()
                if batch and payload and isinstance(payload[0], (int, float)):
                    payload = [payload]
                if not isinstance(payload, list) or len(payload) != len(batch):
                    raise RuntimeError("embedding response count does not match request")
                vectors.extend(payload)
                time.sleep(0.15)
                break
            if response.status_code not in (429, 503) or attempt == 3:
                raise RuntimeError(f"HF embed failed ({response.status_code}): {response.text[:300]}")
            wait = 5 * (attempt + 1)
            print(f"    HF {response.status_code}; retrying in {wait}s", flush=True)
            time.sleep(wait)
    return vectors


def qdrant(method: str, path: str, body: dict) -> dict:
    last_error = "unknown error"
    for attempt in range(4):
        try:
            response = session.request(
                method, f"{QDRANT_URL}{path}", headers=QDRANT_HEADERS, json=body, timeout=90
            )
            if response.ok:
                return response.json()
            last_error = f"{response.status_code}: {response.text[:300]}"
            retryable = response.status_code == 429 or response.status_code >= 500
        except requests.RequestException as error:
            last_error = str(error)
            retryable = True
        if not retryable or attempt == 3:
            break
        wait = 3 * (attempt + 1)
        print(f"    Qdrant request failed; retrying in {wait}s", flush=True)
        time.sleep(wait)
    raise RuntimeError(f"Qdrant {method} {path} failed: {last_error}")


def ensure_indexes() -> None:
    for field, schema in (("book_id", "keyword"), ("page_number", "integer"), ("para_number", "integer")):
        qdrant("PUT", f"/collections/{COLLECTION}/index", {"field_name": field, "field_schema": schema})


def page_point_ids(book_id: str, page_number: int) -> list[str]:
    ids: list[str] = []
    offset = None
    while True:
        body = {
            "filter": {"must": [
                {"key": "book_id", "match": {"value": book_id}},
                {"key": "page_number", "match": {"value": page_number}},
            ]},
            "with_payload": False,
            "limit": 256,
        }
        if offset is not None:
            body["offset"] = offset
        result = qdrant("POST", f"/collections/{COLLECTION}/points/scroll", body).get("result", {})
        ids.extend(str(point["id"]) for point in result.get("points", []))
        offset = result.get("next_page_offset")
        if offset is None:
            return ids


def reindex_page(book_id: str, title: str, categories: list, page_number: int, page: dict, dry_run: bool) -> int:
    passages = split_passages(page.get("lines"))
    if not passages:
        print(f"  p.{page_number}: skip (no usable text)")
        return 0
    if dry_run:
        print(f"  p.{page_number}: {len(passages)} passages; {passages[0][:90]!r}")
        return len(passages)

    vectors = embed(passages)
    points = []
    for index, (text, vector) in enumerate(zip(passages, vectors), start=1):
        points.append({
            "id": str(uuid.uuid4()),
            "vector": vector,
            "payload": {
                "book_id": book_id,
                "book_title": title,
                "categories": categories,
                "page_number": page_number,
                "para_number": index,
                "paragraph_number": index,
                "preview": text[:1200],
                **passage_metadata(text, page),
            },
        })

    old_ids = page_point_ids(book_id, page_number)
    # Upsert first; successful old vectors remain available if embedding or an
    # earlier upsert fails. Cleanup only happens after the new page is complete.
    for start in range(0, len(points), UPSERT_BATCH):
        qdrant("PUT", f"/collections/{COLLECTION}/points", {"points": points[start:start + UPSERT_BATCH]})
    for start in range(0, len(old_ids), 256):
        qdrant("POST", f"/collections/{COLLECTION}/points/delete", {"points": old_ids[start:start + 256]})

    db.collection("scriptures").document(book_id).collection("pages").document(str(page_number)).set({
        "passageCount": len(passages),
        "indexingVersion": 2,
        "indexedAt": gfs.SERVER_TIMESTAMP,
    }, merge=True)
    print(f"  p.{page_number}: {len(passages)} passages indexed")
    return len(passages)


def books_to_process(args: argparse.Namespace):
    if args.book:
        for book_id in args.book:
            snap = db.collection("scriptures").document(book_id).get()
            if not snap.exists:
                print(f"! Scripture not found: {book_id}", file=sys.stderr)
                continue
            yield snap.reference, snap.to_dict() or {}
        return
    for snap in db.collection("scriptures").stream():
        data = snap.to_dict() or {}
        if args.all or data.get("status") == "ready":
            yield snap.reference, data


def main() -> None:
    parser = argparse.ArgumentParser(description="Reindex Jain scriptures into paragraph-sized Qdrant passages")
    parser.add_argument("--book", action="append", help="Firestore scripture ID; may be specified more than once")
    parser.add_argument("--all", action="store_true", help="include scriptures regardless of processing status")
    parser.add_argument("--from", dest="page_from", type=int, default=None)
    parser.add_argument("--to", dest="page_to", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true", help="show passages without embedding or writing")
    parser.add_argument("--force", action="store_true", help="rebuild pages already marked indexingVersion 2")
    args = parser.parse_args()
    if not args.book and not args.all:
        parser.error("provide --book ID or --all")

    if not args.dry_run:
        ensure_indexes()
    total_books = total_pages = total_passages = 0
    for ref, book in books_to_process(args):
        title = book.get("title") or ref.id
        categories = book.get("categories") if isinstance(book.get("categories"), list) else []
        print(f"\n{title} ({ref.id})")
        # Materialize the page stream before embedding. Holding a Firestore
        # stream open for a long reindex can exceed its RPC deadline midway
        # through an otherwise healthy migration.
        page_docs = [
            (page_snap, page_snap.to_dict() or {})
            for page_snap in ref.collection("pages").order_by("pageNumber").stream()
        ]
        count = 0
        for page_snap, page in page_docs:
            page_number = page.get("pageNumber")
            if not isinstance(page_number, int):
                continue
            if args.page_from and page_number < args.page_from:
                continue
            if args.page_to and page_number > args.page_to:
                continue
            if not args.dry_run and not args.force and page.get("indexingVersion") == 2:
                print(f"  p.{page_number}: skip (already indexed)")
                continue
            try:
                total_passages += reindex_page(ref.id, title, categories, page_number, page, args.dry_run)
            except Exception as error:
                # Continue so a temporary provider failure affects one page,
                # not the entire corpus. A later run resumes from this page.
                print(f"  p.{page_number}: ERROR {error}", file=sys.stderr)
                continue
            total_pages += 1
            count += 1
        if count:
            total_books += 1
    print(f"\nDone — {total_books} books, {total_pages} pages, {total_passages} passages")


if __name__ == "__main__":
    main()
