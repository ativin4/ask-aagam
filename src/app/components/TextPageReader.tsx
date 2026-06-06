"use client";

import { useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { auth } from "../../../lib/firebase";

interface Page {
  pageNumber: number;
  lines: string[];
}

interface TextPageReaderProps {
  scriptureId: string;
  jumpToPage?: number | null;
  onPageChange?: (pageNumber: number) => void;
  isMaintainer?: boolean;
}

const NUMBERED_START = /^[१२३४५६७८९\d]+[.)।]\s/;
const LONE_NUMBER    = /^\d{1,4}$/;
const GEMMA_LINE     = /^(?:here is (?:the |a )?(?:refined|corrected|cleaned)|refined text:|corrected text:|version\s+\S+:|remember to check)/i;

function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*\*/g, "").trim();
}

function shouldSkip(line: string): boolean {
  return !line || LONE_NUMBER.test(line);
}

function trimPreamble(lines: string[]): string[] {
  let i = 0;
  while (i < lines.length) {
    const c = stripMarkdown(lines[i]).trim();
    if (!c || GEMMA_LINE.test(c)) i++;
    else break;
  }
  return lines.slice(i);
}

function splitAtNumberedBoundaries(line: string): string[] {
  return line
    .split(/(?<=[।॥.!?\s])(?=[१२३४५६७८९\d]+[.)।]\s)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const SUTRA_END    = /[।॥][०-९0-9\s]*[।॥]\s*$/;
const ANVAYARTHA   = /^(?:अन्वयार्थ\s*[:-]|Meaning\s*[:-]|अर्थ\s*[:-])/i;
const COMMENTARY   = /^(?:सर्वार्थसिद्धि\s*[:-]|राजवार्तिक\s*[:-]|टीका\s*[:-]|विवेचन\s*[:-])/i;
const CHAPTER_HDR  = /^(?:अथ\s+\S+|(?:प्रथम|द्वितीय|तृतीय|चतुर्थ|पञ्चम|षष्ठ|सप्तम|अष्टम|नवम|दशम)[ःो]\s)/;
const SECTION_MKR  = /^§\s*\.?\s*\d*/;    // § alone OR § N
const LONE_SECTION = /^§\s*$/;             // bare § separator
const PAGE_HDR     = /^[—–-]\d+\s*§/;     // "—113 § 16]" page header artifact
const FOOTNOTE_HDR = /^(?:Footnotes?|टिप्पण|पादटिप्पण)\s*[:-]/i;

function renderLines(lines: string[]): ReactNode[] {
  const segments: string[] = [];
  for (const raw of trimPreamble(lines)) {
    const cleaned = stripMarkdown(raw);
    if (shouldSkip(cleaned)) continue;
    splitAtNumberedBoundaries(cleaned).forEach((s) => segments.push(s));
  }

  const nodes: ReactNode[] = [];
  let inFootnotes = false;

  segments.forEach((seg, i) => {
    // Chapter header
    if (CHAPTER_HDR.test(seg)) {
      nodes.push(
        <div key={i} className="mt-8 mb-4">
          <p className="font-bold text-gray-900 text-lg tracking-wide border-b-2 border-purple-200 pb-2">
            {seg}
          </p>
        </div>
      );
      return;
    }

    // Section marker § N  (or bare § = thin rule separator)
    if (SECTION_MKR.test(seg)) {
      if (LONE_SECTION.test(seg)) {
        // Bare § — just a thin visual separator
        nodes.push(<hr key={i} className="my-3 border-dashed border-gray-200" />);
        return;
      }
      const m = seg.match(/^(§\s*\.?\s*\d+)([\s\S]*)/);
      const badge = m ? m[1].trim() : seg;
      const rest  = m ? m[2].trim() : "";
      nodes.push(
        <div key={i} className="mt-5 mb-1 flex items-start gap-2">
          <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 font-mono mt-0.5">
            {badge}
          </span>
          {rest && <p className="flex-1 text-gray-700 leading-relaxed">{rest}</p>}
        </div>
      );
      return;
    }

    // Sutra — ends with ।।N।। or ॥N॥
    if (SUTRA_END.test(seg)) {
      nodes.push(
        <div key={i} className="my-4 rounded-lg overflow-hidden border border-purple-200">
          <div className="bg-purple-50 px-1 py-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
            <span className="text-purple-400 text-xs font-medium uppercase tracking-wider">Sutra</span>
          </div>
          <p className="px-4 py-3 font-semibold text-purple-900 leading-loose bg-white">
            {seg}
          </p>
        </div>
      );
      return;
    }

    // Translation / meaning
    if (ANVAYARTHA.test(seg)) {
      nodes.push(
        <p key={i} className="my-3 pl-4 border-l-2 border-amber-300 text-gray-600 italic text-sm leading-relaxed bg-amber-50 py-2 pr-2 rounded-r">
          {seg}
        </p>
      );
      return;
    }

    // Commentary source label
    if (COMMENTARY.test(seg)) {
      nodes.push(
        <p key={i} className="mt-6 mb-2 font-bold text-emerald-800 text-sm uppercase tracking-wide">
          {seg}
        </p>
      );
      return;
    }

    // Numbered sub-point
    if (NUMBERED_START.test(seg)) {
      nodes.push(
        <p key={i} className="mt-4 mb-2 font-medium text-gray-800">{seg}</p>
      );
      return;
    }

    // Page header artifact (e.g. "—113 § 16]") — render dimmed
    if (PAGE_HDR.test(seg)) {
      nodes.push(
        <p key={i} className="text-xs text-gray-300 mb-1 font-mono">{seg}</p>
      );
      return;
    }

    // Footnotes separator
    if (FOOTNOTE_HDR.test(seg)) {
      inFootnotes = true;
      nodes.push(
        <div key={i} className="mt-8 pt-4 border-t border-dashed border-gray-300">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{seg}</p>
        </div>
      );
      return;
    }

    // Prose — footnote vs normal
    if (inFootnotes) {
      nodes.push(
        <p key={i} className="text-xs text-gray-500 mb-1 leading-relaxed">{seg}</p>
      );
    } else {
      nodes.push(
        <p key={i} className="mb-4 text-gray-800 leading-loose">{seg}</p>
      );
    }
  });

  return nodes;
}

export default function TextPageReader({
  scriptureId, jumpToPage, onPageChange, isMaintainer,
}: TextPageReaderProps) {
  const [pages, setPages]       = useState<Page[]>([]);
  const [current, setCurrent]   = useState(0);
  const [loading, setLoading]   = useState(true);
  const [fontSize, setFontSize] = useState(17);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    setLoading(true); setCurrent(0);
    fetch(`/api/scriptures/${scriptureId}/pages`)
      .then((r) => r.json())
      .then((d) => setPages(d.pages ?? []))
      .finally(() => setLoading(false));
  }, [scriptureId]);

  useEffect(() => {
    if (!jumpToPage || !pages.length) return;
    const idx = pages.findIndex((p) => p.pageNumber === jumpToPage);
    if (idx !== -1) setCurrent(idx);
  }, [jumpToPage, pages]);

  useEffect(() => {
    if (!loading && pages.length > 0) onPageChangeRef.current?.(pages[current].pageNumber);
  }, [current, loading, pages]);

  const handleEditOpen = useCallback(() => {
    if (!pages.length) return;
    setEditText(pages[current].lines.join("\n"));
    setSaveError(null);
    setEditMode(true);
  }, [pages, current]);

  const handleSave = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setSaving(true); setSaveError(null);
    try {
      const token = await user.getIdToken();
      const lines = editText.split("\n").map((l) => l.trim()).filter(Boolean);
      const res = await fetch(
        `/api/scriptures/${scriptureId}/pages/${pages[current].pageNumber}/correct`,
        { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ lines }) }
      );
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Save failed"); }
      setPages((prev) => prev.map((p, i) => i === current ? { ...p, lines } : p));
      setEditMode(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [editText, scriptureId, pages, current]);

  const goTo = useCallback((idx: number) => {
    setCurrent(Math.max(0, Math.min(idx, (pages.length || 1) - 1)));
    setEditMode(false);
  }, [pages.length]);

  if (loading) return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
        <span className="text-sm">Loading pages…</span>
      </div>
    </div>
  );

  if (!pages.length) return (
    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">No pages found.</div>
  );

  const page     = pages[current];
  const progress = pages.length > 1 ? (current / (pages.length - 1)) * 100 : 0;

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#fdfcf8" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex-none flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white/80 backdrop-blur-sm text-sm gap-3">
        <span className="text-gray-400 text-xs font-medium whitespace-nowrap">
          Page <span className="text-gray-700 font-semibold">{page.pageNumber}</span>
          <span className="text-gray-400"> / {pages.length}</span>
        </span>
        <div className="flex items-center gap-2">
          {isMaintainer && !editMode && (
            <button
              onClick={handleEditOpen}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
            >
              Edit OCR
            </button>
          )}
          {!editMode && (
            <>
              <button
                onClick={() => setFontSize((f) => Math.max(12, f - 2))}
                className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 text-xs font-bold transition-colors"
                title="Decrease font size"
              >A−</button>
              <button
                onClick={() => setFontSize((f) => Math.min(36, f + 2))}
                className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 text-xs font-bold transition-colors"
                title="Increase font size"
              >A+</button>
              <button
                onClick={() => window.print()}
                className="px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 text-xs transition-colors"
                title="Print / Save as PDF"
              >PDF</button>
            </>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {editMode ? (
        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
          <p className="text-xs text-gray-500">One line per paragraph. Save will update Firestore + re-embed.</p>
          <textarea
            className="flex-1 border rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditMode(false)} className="px-3 py-1.5 rounded-lg border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50">
              {saving ? "Saving…" : "Save & Re-embed"}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto min-h-0 py-6 px-4"
          style={{ fontSize: `${fontSize}px`, fontFamily: "var(--font-devanagari), 'Noto Sans Devanagari', 'Mangal', serif" }}
        >
          {/* Reading column — max width for comfortable line length */}
          <div className="max-w-2xl mx-auto">
            {renderLines(page.lines)}
          </div>
        </div>
      )}

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div className="flex-none h-0.5 bg-gray-100">
        <div
          className="h-full bg-purple-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {/* pr-20 on mobile gives space for the fixed chat FAB (bottom-6 right-6 = ~56px wide) */}
      <div className="flex-none flex items-center justify-between gap-3 px-4 py-3 pr-20 sm:pr-4 bg-white border-t border-gray-200">
        {/* Prev */}
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-30"
          style={{
            background: current === 0 ? "#f3f4f6" : "linear-gradient(135deg,#7c3aed,#4f46e5)",
            color: current === 0 ? "#9ca3af" : "white",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Prev
        </button>

        {/* Page picker */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={pages.length}
            value={page.pageNumber}
            onChange={(e) => {
              const n = parseInt(e.target.value);
              if (!isNaN(n)) {
                const idx = pages.findIndex((p) => p.pageNumber === n);
                if (idx !== -1) goTo(idx);
              }
            }}
            className="w-16 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ "--tw-ring-color": "#7c3aed" } as React.CSSProperties}
          />
          <span className="text-xs text-gray-400">/ {pages.length}</span>
        </div>

        {/* Next */}
        <button
          onClick={() => goTo(current + 1)}
          disabled={current === pages.length - 1}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-30"
          style={{
            background: current === pages.length - 1 ? "#f3f4f6" : "linear-gradient(135deg,#7c3aed,#4f46e5)",
            color: current === pages.length - 1 ? "#9ca3af" : "white",
          }}
        >
          Next
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
