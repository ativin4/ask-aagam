#!/usr/bin/env python3
"""
OCR via Gemini CLI (gemini --yolo).  No API key needed — uses CLI auth.
Renders each PDF page to PNG → gemini CLI vision → Firestore + Qdrant + JSONL.

Usage:
  python3 scripts/gemini-ocr-fix.py --book NnVpzY7yyAYSTtMFaqE0
  python3 scripts/gemini-ocr-fix.py --book NnVpzY7yyAYSTtMFaqE0 --from 1 --to 50
  python3 scripts/gemini-ocr-fix.py --book NnVpzY7yyAYSTtMFaqE0 --dry-run
"""

import os, sys, re, json, uuid, argparse, time, subprocess
from pathlib import Path
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).parent.parent / ".env")
os.environ.update({k: v for k, v in env.items() if v})

PROJECT_ID   = os.environ["NEXT_PUBLIC_FIREBASE_PROJECT_ID"]
CLIENT_EMAIL = os.environ["NEXT_FILE_UPLOAD_CLIENT_EMAIL"]
PRIVATE_KEY  = os.environ["NEXT_FILE_UPLOAD_PRIVATE_KEY"].replace("\\n", "\n")
BUCKET_NAME  = os.environ["NEXT_PUBLIC_BUCKET_NAME"]
QDRANT_URL   = os.environ["QDRANT_URL"]
QDRANT_KEY   = os.environ["QDRANT_API_KEY"]
HF_TOKEN     = os.environ["HF_TOKEN"]

QDRANT_COLLECTION = "scripture_pages"
HF_EMBED_API  = "https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large"
IMG_DIR       = Path(__file__).parent.parent / "tmp-ocr"
TRAINING_DIR  = Path(__file__).parent.parent / "training_data"

# CLI default model free tier: ~15 RPM.  6s gap = 10 RPM (safe margin).
MIN_INTERVAL = 6.0
_last_call   = 0.0

import requests, fitz
import firebase_admin
from firebase_admin import credentials, storage as fb_storage
from google.cloud import firestore as _gfs
from google.oauth2 import service_account as _svc

sa_info = {
    "type": "service_account",
    "project_id": PROJECT_ID,
    "client_email": CLIENT_EMAIL,
    "private_key": PRIVATE_KEY,
    "token_uri": "https://oauth2.googleapis.com/token",
}
if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(sa_info), {"storageBucket": BUCKET_NAME})
bucket = fb_storage.bucket()

_sa_creds = _svc.Credentials.from_service_account_info(
    sa_info,
    scopes=["https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/datastore"],
)
db = _gfs.Client(project=PROJECT_ID, credentials=_sa_creds)
print("✓ Firestore + GCS connected")

# ── Prompt ────────────────────────────────────────────────────────────────────
PROMPT = (
    "This is a scanned page from the Sarvarthasiddhi (सर्वार्थसिद्धि), a classical Jain "
    "commentary on Tattvartha Sutra. Pages contain Sanskrit and/or Hindi Devanagari text, "
    "often with both scripts on the same page (Sanskrit commentary above, Hindi translation below).\n"
    "Transcribe ALL text that is physically printed on this page. "
    "Output ONLY the transcribed text — no commentary, no introduction, no explanation. "
    "Start immediately with the first character. Preserve paragraph and line breaks.\n"
    "Formatting rules:\n"
    "  • Verse-end markers: restore as ।।NUMBER।।  (e.g. '||42||', '11 42 11' → ।।42।।)\n"
    "  • Section markers: preserve §.N or § N exactly as printed (§ 841, §.275, etc.)\n"
    "  • Page/section headers in brackets: preserve as-is ([337], [9, [424] etc.)\n"
    "  • Footnote superscripts: keep as plain digit after word (word¹ → word1)\n"
    "  • Chapter headers (प्रथमोऽध्यायः, अथ अष्टमोऽध्यायः etc.): preserve with surrounding lines\n"
    "  • Devanagari corrections: fix missing matras, anusvara (ं), visarga (ः), chandrabindu (ँ)\n"
    "  • Rejoin split conjuncts (क ्ष → क्ष, ह ्न → ह्न, etc.)\n"
    "  • If Latin/ASCII chars appear in Devanagari context, decode as Krutidev/Shivaji font encoding\n"
    "  • Preserve column structure: if page has two columns, transcribe left column then right\n"
    "  • Footnotes: text below a horizontal separator line at page bottom — "
    "transcribe them after a blank line as 'Footnotes: 1. ... 2. ...'\n"
    "  • Treat § lines as anchors — never merge them with surrounding prose\n"
    "Common Devanagari confusion pairs to watch: म/भ, ध/घ, व/ब, ड/ड़, न/म, "
    "and complex conjuncts like त्त्व, च्छ, ष्ट, ह्न — transcribe carefully.\n"
    "Mark truly illegible text as [illegible]. "
    "IMPORTANT: transcribe only what is physically on this image. "
    "Even if only a page number or section header is visible, transcribe that."
)

SIMPLE_PROMPT = (
    "Transcribe all Devanagari text from this scanned Jain scripture page. "
    "Output only the text, preserving line breaks. "
    "Include page numbers, section markers (§.N), and all visible text."
)

_PREAMBLE_RE = re.compile(
    r"^(?:here(?:'s| is)|sure[,!]?|okay[,.]?|the (?:text|transcription)|"
    r"(?:corrected|refined|clean)\s+text:|i(?:'ll| will)|let me |based on )",
    re.IGNORECASE,
)
_NOISE_RE = re.compile(
    r"^\s*(?:"
    r"I\d{4}\s\d{2}:\d{2}:\d{2}"   # gRPC/logging timestamps
    r"|FD from fork"
    r"|ev_poll"
    r"|Attempt \d+ failed|Retrying after"
    r"|reason:.*QUOTA|code: 429"
    r")"
)


class QuotaExhaustedError(Exception):
    pass


def _clean(raw: str) -> str:
    out = []
    for ln in raw.splitlines():
        if _NOISE_RE.match(ln):
            continue
        if _PREAMBLE_RE.match(ln.strip()):
            continue
        out.append(ln)
    text = "\n".join(out).strip()
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\|{1,2}(\d+)\|{1,2}", r"।।\1।।", text)
    text = re.sub(r"(?<![\d।])1{1,2}(\d{1,4})1{1,2}(?![\d।])", r"।।\1।।", text)
    return text.strip()


_REFUSAL_RE = re.compile(
    r"(cannot access the file|outside of my (designated )?workspace|"
    r"unable to access|not have (the )?permissions? to read)",
    re.IGNORECASE,
)


_DEVA_RE = re.compile(r'[ऀ-ॿ]')
_LONE_NUM_RE = re.compile(r'^\s*\d+\s*$', re.MULTILINE)


def _is_bad(text: str) -> bool:
    stripped = text.strip()
    # < 100 chars = likely a missed/partial OCR (p.118 had 25 chars but was a full page)
    if len(stripped) < 100:
        return True
    if "णमो अरिहंताणं" in stripped and len(stripped) < 400:
        return True
    if _REFUSAL_RE.search(stripped):
        return True
    return False


def _quality_check(text: str) -> tuple[bool, str]:
    """Return (is_ok, reason). Called after OCR passes _is_bad().
    Catches subtle quality issues without rejecting legitimate short pages."""
    stripped = text.strip()
    total = len(stripped)

    # Devanagari ratio check: Jain scripture pages should be mostly Devanagari
    deva_count = len(_DEVA_RE.findall(stripped))
    if total > 300 and deva_count / total < 0.15:
        return False, f"low Devanagari ratio {deva_count}/{total} ({100*deva_count//total}%)"

    # Too many lone-number lines = garbled output (OCR returned scattered numbers)
    lone_nums = len(_LONE_NUM_RE.findall(stripped))
    all_lines = [l for l in stripped.splitlines() if l.strip()]
    if all_lines and lone_nums / len(all_lines) > 0.4:
        return False, f"high lone-number ratio {lone_nums}/{len(all_lines)} lines"

    # No Devanagari at all in a long response
    if total > 200 and deva_count == 0:
        return False, "no Devanagari characters in output"

    return True, ""


_current_model: str | None = None  # None = CLI default (flash)


def ocr_page(img_path: Path) -> str:
    global _last_call
    wait = MIN_INTERVAL - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.time()

    prompt = f"@{img_path.absolute()}\n{PROMPT}"
    cmd = ["gemini", "--yolo", "-p", prompt]
    if _current_model:
        cmd = ["gemini", "-m", _current_model, "--yolo", "-p", prompt]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        raise TimeoutError("timeout")

    raw = result.stdout
    stderr = result.stderr or ""
    combined = (raw + stderr).lower()
    if "quota" in combined or "resource_exhausted" in combined or "rate limit" in combined or "terminalquotaerror" in combined:
        raise QuotaExhaustedError((raw + "\n" + stderr)[:300])

    return _clean(raw)


def ocr_page_with_quality(img_path: Path) -> tuple[str, bool]:
    """OCR with automatic quality gate + fallback to SIMPLE_PROMPT.
    Returns (text, needs_review_flag)."""
    global _last_call

    text = ocr_page(img_path)

    # Quality gate
    ok, reason = _quality_check(text)
    if not ok:
        print(f"\n  ⚠ quality issue ({reason}) — retrying with simple prompt", end="", flush=True)
        wait = MIN_INTERVAL - (time.time() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.time()
        cmd = ["gemini", "--yolo", "-p", f"@{img_path.absolute()}\n{SIMPLE_PROMPT}"]
        if _current_model:
            cmd = ["gemini", "-m", _current_model, "--yolo", "-p",
                   f"@{img_path.absolute()}\n{SIMPLE_PROMPT}"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            text2 = _clean(result.stdout)
            ok2, reason2 = _quality_check(text2)
            if ok2:
                return text2, False
            else:
                print(f" — still bad ({reason2}), flagging for review", end="", flush=True)
                return text2, True   # needs_review = True
        except Exception:
            pass
        return text, True   # original text, flag for review

    return text, False


# ── Qdrant ────────────────────────────────────────────────────────────────────
def _split_paragraphs(lines, max_chars=900):
    """Create paragraph-sized semantic passages instead of one vector per OCR line."""
    blocks, pending = [], []

    def flush_block():
        nonlocal pending
        text = " ".join(pending).strip()
        if text:
            blocks.append(text)
        pending = []

    for raw in lines:
        line = raw.strip()
        if line:
            pending.append(line)
        else:
            flush_block()
    flush_block()

    passages, current = [], ""
    for block in blocks:
        # Keep natural sentence/verse boundaries whenever possible.
        pieces = [p.strip() for p in re.split(r"(?<=[।॥.!?])\s+", block) if p.strip()]
        for piece in pieces or [block]:
            if len(piece) > max_chars:
                if current:
                    passages.append(current); current = ""
                passages.extend(piece[i:i + max_chars] for i in range(0, len(piece), max_chars))
            elif not current:
                current = piece
            elif len(current) + len(piece) + 1 <= max_chars:
                current += " " + piece
            else:
                passages.append(current)
                current = piece
    if current:
        passages.append(current)
    return [(index, 0, text) for index, text in enumerate(passages, start=1) if len(text) >= 15]


def embed_texts(texts: list) -> list:
    resp = requests.post(
        HF_EMBED_API,
        headers={"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"},
        json={"inputs": [f"passage: {t}" for t in texts]},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def replace_qdrant(book_id, page_number, lines, book_title, categories):
    headers = {"api-key": QDRANT_KEY, "Content-Type": "application/json"}
    for field in ("page_number", "para_number", "line_number"):
        requests.put(
            f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/index",
            headers=headers,
            json={"field_name": field, "field_schema": "integer"},
        )
    quads = _split_paragraphs(lines)
    if not quads:
        return 0
    # Embed before touching existing vectors. A failed OCR/embedding pass must
    # not make a previously searchable scripture page disappear.
    vectors = embed_texts([q[2] for q in quads])

    scroll = requests.post(
        f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points/scroll",
        headers=headers,
        json={"filter": {"must": [
            {"key": "book_id",     "match": {"value": book_id}},
            {"key": "page_number", "match": {"value": page_number}},
        ]}, "with_payload": False, "limit": 500},
        timeout=30,
    ).json()
    old_ids = [p["id"] for p in scroll.get("result", {}).get("points", [])]
    requests.put(
        f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points",
        headers=headers,
        json={"points": [{
            "id": str(uuid.uuid4()), "vector": vectors[j],
            "payload": {
                "book_id": book_id, "book_title": book_title,
                "categories": categories, "page_number": page_number,
                "para_number": quads[j][0], "line_number": quads[j][1],
                "paragraph_number": quads[j][0],
                "preview": quads[j][2][:1200],
            },
        } for j in range(len(quads))]},
        timeout=30,
    ).raise_for_status()
    if old_ids:
        requests.post(
            f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points/delete",
            headers=headers, json={"points": old_ids}, timeout=30,
        ).raise_for_status()
    return len(quads)


# ── Main ──────────────────────────────────────────────────────────────────────
def fix_scripture(book_id: str, page_from: int = None, page_to: int = None,
                  dry_run: bool = False, force_pages: set[int] | None = None):
    meta = db.collection("scriptures").document(book_id).get().to_dict()
    if not meta:
        print(f"✗ Scripture '{book_id}' not found"); sys.exit(1)

    book_title = meta.get("title", book_id)
    categories = meta.get("categories", [])
    page_count = meta.get("pageCount", 0)
    gcs_path   = meta.get("gcsPath", "")
    print(f"\nScripture : {book_title}  ({page_count} pages)")

    page_from = page_from or 1
    page_to   = page_to   or page_count
    print(f"Range     : {page_from}–{page_to}\n")

    pdf_path = Path(f"/tmp/{book_id}.pdf")
    if not pdf_path.exists():
        print(f"Downloading {gcs_path} ...", end="", flush=True)
        bucket.blob(gcs_path).download_to_filename(str(pdf_path))
        print(" done")
    else:
        print(f"✓ PDF cached: {pdf_path}")

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    TRAINING_DIR.mkdir(parents=True, exist_ok=True)
    training_file = TRAINING_DIR / f"{book_id}_ocr_pairs.jsonl"

    # ── Audit JSONL, rebuild done-pages ──────────────────────────────────────
    _bad_signals = ("QUOTA_EXHAUSTED", "exhausted your capacity",
                    "Retrying after", "unexpected critical error")

    done_pages, clean_lines = set(), []
    if training_file.exists():
        for raw_line in training_file.read_text(encoding="utf-8").splitlines():
            if not raw_line.strip():
                continue
            try:
                d = json.loads(raw_line)
                text = (d.get("text", "") or
                        (d.get("messages", [{}])[-1].get("content", "") if "messages" in d else ""))
                pg   = d.get("page") or d.get("metadata", {}).get("page")
                if any(s in text for s in _bad_signals) or _is_bad(text):
                    continue
                clean_lines.append(raw_line)
                if pg:
                    done_pages.add(pg)
            except Exception:
                pass
        training_file.write_text(
            "\n".join(clean_lines) + ("\n" if clean_lines else ""), encoding="utf-8"
        )
        if force_pages:
            done_pages -= force_pages
            print(f"  Force-reprocessing: {sorted(force_pages)}")
        print(f"✓ JSONL: {len(clean_lines)} clean, {len(done_pages)} pages already done")
        if done_pages:
            sk = sorted(done_pages)
            print(f"  Skipping: {sk[:15]}{'...' if len(sk) > 15 else ''}")

    # ── Render pages ──────────────────────────────────────────────────────────
    doc = fitz.open(str(pdf_path))
    page_nums = [n for n in range(page_from, page_to + 1)
                 if n - 1 < len(doc) and n not in done_pages]
    print(f"\nRendering {len(page_nums)} pages...", end="", flush=True)
    for n in page_nums:
        pix = doc.load_page(n - 1).get_pixmap(matrix=fitz.Matrix(2, 2))
        pix.save(str(IMG_DIR / f"p{n}.png"))
    doc.close()
    print(" done\n")

    if not page_nums:
        print("Nothing to process.")
        return

    training_out = None if dry_run else open(training_file, "a", encoding="utf-8")
    errors = []

    for page_num in page_nums:
        img_path = IMG_DIR / f"p{page_num}.png"
        print(f"  p.{page_num}: ", end="", flush=True)

        needs_review = False
        try:
            text, needs_review = ocr_page_with_quality(img_path)
        except QuotaExhaustedError:
            global _current_model
            if _current_model != "gemini-2.5-pro":
                _current_model = "gemini-2.5-pro"
                print(f"\n⚠ QUOTA (flash) at p.{page_num} → switching to gemini-2.5-pro")
                try:
                    text, needs_review = ocr_page_with_quality(img_path)
                except QuotaExhaustedError:
                    resume = TRAINING_DIR / f"{book_id}.resume"
                    resume.write_text(str(page_num))
                    print(f"\n⚠ QUOTA (pro) at p.{page_num}. Resume: {resume}")
                    if training_out:
                        training_out.close()
                    sys.exit(2)
                except Exception as e:
                    print(f"ERROR: {e}"); errors.append((page_num, str(e))); continue
            else:
                resume = TRAINING_DIR / f"{book_id}.resume"
                resume.write_text(str(page_num))
                print(f"\n⚠ QUOTA (pro) at p.{page_num}. Resume: {resume}")
                if training_out:
                    training_out.close()
                sys.exit(2)
        except TimeoutError:
            print("timeout"); errors.append((page_num, "timeout")); continue
        except Exception as e:
            print(f"ERROR: {e}"); errors.append((page_num, str(e))); continue

        if _is_bad(text):
            print(f"BAD ({len(text)} chars) — skip")
            errors.append((page_num, f"bad: {text[:60]!r}"))
            continue

        # Blank lines are meaningful paragraph boundaries for semantic indexing.
        lines = [l.strip() for l in text.split("\n")]
        while lines and not lines[-1]:
            lines.pop()
        print(f"ok ({len(lines)} lines)", end="", flush=True)

        if dry_run:
            print(f"\n    {text[:150]}")
            continue

        try:
            gcs_img = f"training/images/{book_id}/p{page_num}.png"
            bucket.blob(gcs_img).upload_from_filename(str(img_path), content_type="image/png")

            training_out.write(json.dumps({
                "messages": [
                    {"role": "user", "content": [
                        {"type": "image", "image": f"gs://{BUCKET_NAME}/{gcs_img}"},
                        {"type": "text",  "text": "Transcribe this Jain scripture page. "
                                                   "Output ONLY the clean Devanagari/Sanskrit/Hindi text."},
                    ]},
                    {"role": "assistant", "content": "\n".join(lines)},
                ],
                "metadata": {"book_id": book_id, "page": page_num, "source": "gemini-cli-ocr"},
            }, ensure_ascii=False) + "\n")
            training_out.flush()

            passage_count = replace_qdrant(book_id, page_num, lines, book_title, categories)
            fs_data: dict = {"pageNumber": page_num, "lines": lines,
                             "passageCount": passage_count, "indexingVersion": 2,
                             "patchedAt": _gfs.SERVER_TIMESTAMP}
            if needs_review:
                fs_data["ocrNeedsReview"] = True
            db.collection("scriptures").document(book_id) \
              .collection("pages").document(str(page_num)) \
              .set(fs_data, merge=True)

            flag = " ⚠ needs_review" if needs_review else ""
            print(f" → saved{flag}")
        except Exception as e:
            print(f" → SAVE ERROR: {e}")
            errors.append((page_num, f"save: {e}"))

    if training_out:
        training_out.close()

    print(f"\n{'─'*50}")
    print(f"Done.  Processed: {len(page_nums) - len(errors)}  Errors: {len(errors)}")
    for p, e in errors:
        print(f"  p.{p}: {e}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--book",    required=True)
    ap.add_argument("--from",    dest="page_from", type=int, default=None)
    ap.add_argument("--to",      dest="page_to",   type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force",   dest="force_pages", type=int, nargs="+", metavar="PAGE",
                    help="Force re-process specific pages even if already in JSONL")
    args = ap.parse_args()
    fix_scripture(args.book, args.page_from, args.page_to, args.dry_run,
                  force_pages=set(args.force_pages) if args.force_pages else None)
