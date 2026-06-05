#!/usr/bin/env python3
"""
Check Tattvartha Sutra <-> Sarvarthasiddhi coverage.

Two separate checks:
  A) GitHub import (M8jEdTElAaFwT0FbMtAl):
     Each page should have sutra text + अन्वयार्थ + सर्वार्थसिद्धि inline.
     Expected: ~100% coverage. Shows any pages missing commentary.

  B) Sarvarthasiddhi OCR PDF (NnVpzY7yyAYSTtMFaqE0):
     Multi-text anthology — Sarvarthasiddhi is only ~30-40 of 552 pages.
     Uses SUTRA NUMBER matching within chapter context (not text matching,
     because Sarvarthasiddhi uses the Digambara recension with different
     sutra texts than the GitHub Shvetambara version).
     Shows which Tattvartha chapters/sutras appear in the OCR.

Usage:
  python3 scripts/check-sutra-coverage.py           # both checks
  python3 scripts/check-sutra-coverage.py --github  # GitHub import only
  python3 scripts/check-sutra-coverage.py --ocr     # Sarvarthasiddhi OCR only
  python3 scripts/check-sutra-coverage.py --ocr --show-pages  # + OCR page details
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
_creds = _svc.Credentials.from_service_account_info(
    sa_info, scopes=["https://www.googleapis.com/auth/cloud-platform",
                     "https://www.googleapis.com/auth/datastore"])
db = _gfs.Client(project=PROJECT_ID, credentials=_creds)

TATV_GITHUB_ID = "M8jEdTElAaFwT0FbMtAl"   # Tattvartha Sutra — GitHub HTML import
SARV_OCR_ID    = "NnVpzY7yyAYSTtMFaqE0"   # Sarvarthasiddhi — OCR PDF anthology

CH_NAMES = {
    1: "Samyagdarshana",   2: "Jiva/senses/bhavas", 3: "Lower universe",
    4: "Devas",            5: "Ajiva/substances",   6: "Asrava",
    7: "Vrata/samvar",     8: "Karma bondage",      9: "Nirjara/tapas",
    10: "Moksha",
}

# Devanagari digit lookup
_DEVA = {"०":"0","१":"1","२":"2","३":"3","४":"4","५":"5","६":"6","७":"7","८":"8","९":"9"}

def deva_to_int(s: str) -> int:
    return int("".join(_DEVA.get(c, c) for c in s))

# Pattern: ।।N।।  ।N।  ॥N॥ where N is Devanagari or ASCII
_SUTRA_NUM_RE = re.compile(r'[।॥]{1,2}\s*([०-९0-9]+)\s*[।॥]{1,2}')


def load_pages(book_id: str, label: str) -> dict[int, dict]:
    print(f"  Loading {label}...", end=" ", flush=True)
    pages: dict[int, dict] = {}
    for doc in db.collection("scriptures").document(book_id).collection("pages").stream():
        d = doc.to_dict()
        if d:
            pn = d.get("pageNumber") or int(doc.id)
            pages[pn] = d
    print(f"{len(pages)} pages")
    return pages


def page_text(doc: dict) -> str:
    return " ".join(doc.get("lines", []))


def extract_sutra_nums(text: str) -> set[int]:
    return {deva_to_int(m.group(1)) for m in _SUTRA_NUM_RE.finditer(text)}


# ── CHECK A: GitHub import ──────────────────────────────────────────────────

def check_github_import(pages: dict[int, dict]) -> None:
    print("\n" + "═"*70)
    print("CHECK A: Tattvartha Sutra — GitHub import (M8jEdTElAaFwT0FbMtAl)")
    print("  Expects inline सर्वार्थसिद्धि commentary on every page.")
    print("═"*70)

    by_ch: dict[int, list[dict]] = {}
    for doc in pages.values():
        ch = doc.get("chapterNumber", 0)
        if ch:
            by_ch.setdefault(ch, []).append(doc)
    for ch in by_ch:
        by_ch[ch].sort(key=lambda d: d.get("sutraNumber", 0))

    total_ok = total_miss = 0
    missing: list[tuple] = []

    print(f"\n{'Ch':>3}  {'Su':>4}  {'Lines':>5}  Commentary present?")
    print("─"*70)

    for ch in sorted(by_ch.keys()):
        ch_ok = ch_miss = 0
        for doc in by_ch[ch]:
            su = doc.get("sutraNumber", 0)
            lines = doc.get("lines", [])
            has_teeka = any("सर्वार्थसिद्धि" in l for l in lines)
            if has_teeka:
                ch_ok += 1
                total_ok += 1
            else:
                ch_miss += 1
                total_miss += 1
                missing.append((ch, su, lines[0][:60] if lines else "", len(lines)))

        pct = 100 * ch_ok / max(1, ch_ok + ch_miss)
        bar = "█" * int(pct // 10) + "░" * (10 - int(pct // 10))
        print(f"     Ch {ch}: {ch_ok}/{ch_ok+ch_miss} [{bar}] {pct:.0f}%  {CH_NAMES.get(ch,'')}")

    total = total_ok + total_miss
    print(f"\n  TOTAL: {total_ok}/{total} sutras have Sarvarthasiddhi commentary inline")
    print(f"  Coverage: {100*total_ok/max(1,total):.1f}%")

    if missing:
        print(f"\n  Missing commentary ({len(missing)} sutras):")
        for ch, su, text, nlines in missing:
            print(f"    Ch {ch}.{su} ({nlines} lines): {text}")
    else:
        print("\n  ✓ All sutras have Sarvarthasiddhi commentary.")


# ── CHECK B: OCR PDF ────────────────────────────────────────────────────────

# Patterns to identify actual Sarvarthasiddhi pages in the anthology
_SARV_FIRST_LINE = re.compile(r'सर्वार्थसिद्धि')
_SEC_MARKER      = re.compile(r'§\s*\.?\s*\d+')
_CH_HEADER       = re.compile(
    r'अथ\s+(?:प्रथम|द्वितीय|तृतीय|चतुर्थ|पञ्चम|षष्ठ|सप्तम|अष्टम|नवम|दशम)'
)
_KNOWN_SARV = {89, 91, 118, 198, 308, 443}   # Manually confirmed commentary pages

# Known chapter starts (page numbers) in the Sarvarthasiddhi OCR anthology
_CH_STARTS = {
    1:  89,    # सर्वार्थसिद्धिः [ १.२ — Ch.1 commentary
    8:  91,    # अथ अष्टमोऽध्यायः — Ch.8 starts
    9:  443,   # § 841] नवमोऽध्यायः — Ch.9 marker
}


def is_sarv_page(doc: dict) -> bool:
    pn = doc.get("pageNumber", 0)
    if pn in _KNOWN_SARV:
        return True
    first = (doc.get("lines", [""])[:1] or [""])[0]
    if _SARV_FIRST_LINE.search(first):
        return True
    if _SEC_MARKER.search(page_text(doc)):
        return True
    return False


def identify_sarv_pages(all_pages: dict[int, dict]) -> set[int]:
    """Identify actual Sarvarthasiddhi pages + ±2 neighbors for commentary spans."""
    anchors: set[int] = set()
    for pn, doc in all_pages.items():
        if is_sarv_page(doc):
            anchors.add(pn)
    expanded: set[int] = set()
    for pn in anchors:
        for offset in range(-2, 3):
            n = pn + offset
            if n in all_pages:
                expanded.add(n)
    return expanded


def check_ocr(sarv_pages: dict[int, dict], tatv_pages: dict[int, dict],
              show_pages: bool = False) -> None:
    print("\n" + "═"*70)
    print("CHECK B: Sarvarthasiddhi OCR PDF (NnVpzY7yyAYSTtMFaqE0)")
    print("  Note: Multi-text anthology. Sarvarthasiddhi is ~30-50 of 552 pages.")
    print("  Note: Uses Digambara recension — sutra texts differ from GitHub Shvetambara.")
    print("  Method: sutra-number matching within identified Sarvarthasiddhi pages.")
    print("═"*70)

    # Identify Sarvarthasiddhi pages
    sarv_page_set = identify_sarv_pages(sarv_pages)
    sarv_docs = sorted([sarv_pages[pn] for pn in sarv_page_set],
                       key=lambda d: d["pageNumber"])
    print(f"\n  Identified Sarvarthasiddhi pages ({len(sarv_page_set)}):")
    print(f"  {sorted(sarv_page_set)}")

    if show_pages:
        print("\n  ── Page details ──")
        for doc in sarv_docs:
            pn = doc["pageNumber"]
            first = doc.get("lines", [""])[0][:80] if doc.get("lines") else "EMPTY"
            print(f"    p.{pn}: {first}")

    # For each known chapter start, identify the chapter's page range
    # and extract which sutra numbers appear
    print("\n" + "─"*70)
    print(f"  {'Ch':>3}  {'Expected':>8}  {'Found':>5}  {'Coverage':>8}  Sutra numbers in OCR")
    print("─"*70)

    # Group Tattvartha pages by chapter for expected counts
    ch_sutra_count: dict[int, int] = {}
    for doc in tatv_pages.values():
        ch = doc.get("chapterNumber", 0)
        if ch:
            ch_sutra_count[ch] = ch_sutra_count.get(ch, 0) + 1

    overall_found = overall_total = 0

    for ch in sorted(ch_sutra_count.keys()):
        expected = ch_sutra_count[ch]
        overall_total += expected

        # Find Sarvarthasiddhi pages for this chapter
        # Use known chapter starts + search for chapter header
        ch_pages: list[dict] = []
        if ch in _CH_STARTS:
            start_p = _CH_STARTS[ch]
            # Find end: next known chapter start, or up to 50 pages
            other_starts = sorted(v for k, v in _CH_STARTS.items() if k != ch and v > start_p)
            end_p = (other_starts[0] - 1) if other_starts else (start_p + 50)
            ch_pages = [d for d in sarv_docs
                        if start_p <= d["pageNumber"] <= end_p]
        else:
            # For chapters without known start, search all sarv_docs
            # for Devanagari chapter header
            ch_name_pattern = {
                2: "द्वितीय", 3: "तृतीय", 4: "चतुर्थ",
                5: "पञ्चम", 6: "षष्ठ", 7: "सप्तम", 10: "दशम"
            }.get(ch, "")
            if ch_name_pattern:
                for doc in sarv_docs:
                    if ch_name_pattern in page_text(doc):
                        ch_pages.append(doc)

        # Extract sutra numbers from chapter pages
        found_nums: set[int] = set()
        for doc in ch_pages:
            text = page_text(doc)
            for n in extract_sutra_nums(text):
                if 1 <= n <= expected:
                    found_nums.add(n)

        found = len(found_nums)
        overall_found += found
        pct = 100 * found / max(1, expected)
        nums_str = ",".join(str(n) for n in sorted(found_nums)[:20])
        if len(found_nums) > 20:
            nums_str += "…"
        page_range = f"p.{_CH_STARTS[ch]}" if ch in _CH_STARTS else "?"
        print(f"  {ch:>3}  {expected:>8}  {found:>5}  {pct:>7.0f}%  [{page_range}] {nums_str or '—'}")

    pct_total = 100 * overall_found / max(1, overall_total)
    print(f"\n  TOTAL: {overall_found}/{overall_total}  Coverage: {pct_total:.1f}%")
    print()
    print("  INTERPRETATION:")
    print("  • Chapters without _CH_STARTS entry: Sarvarthasiddhi section not identified")
    print("    in this anthology PDF → their sutras are absent from this OCR.")
    print("  • For complete Sarvarthasiddhi commentary: use GitHub import (Check A).")
    print("  • The OCR PDF contains: Ch.1 (p.89), Ch.8 (p.91), Ch.9 (p.443+), plus")
    print("    scattered Hindi commentary pages (p.500+, p.520+, p.540+).")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--github",     action="store_true", help="Check A only")
    parser.add_argument("--ocr",        action="store_true", help="Check B only")
    parser.add_argument("--show-pages", action="store_true", help="Show OCR page list")
    args = parser.parse_args()

    run_github = args.github or (not args.github and not args.ocr)
    run_ocr    = args.ocr    or (not args.github and not args.ocr)

    print("Loading Firestore pages...")
    tatv_pages = load_pages(TATV_GITHUB_ID, "Tattvartha Sutra (GitHub)")
    sarv_pages = load_pages(SARV_OCR_ID,    "Sarvarthasiddhi (OCR)")

    if run_github:
        check_github_import(tatv_pages)

    if run_ocr:
        check_ocr(sarv_pages, tatv_pages, show_pages=args.show_pages)


if __name__ == "__main__":
    main()
