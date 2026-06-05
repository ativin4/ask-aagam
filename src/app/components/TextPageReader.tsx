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
const LONE_NUMBER = /^\d{1,4}$/;
const GEMMA_LINE = /^(?:here is (?:the |a )?(?:refined|corrected|cleaned)|refined text:|corrected text:|version\s+\S+:|remember to check)/i;

function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*\*/g, '').trim();
}

function shouldSkip(line: string): boolean {
  if (!line) return true;
  if (LONE_NUMBER.test(line)) return true;
  return false;
}

function trimPreamble(lines: string[]): string[] {
  let i = 0;
  while (i < lines.length) {
    const c = stripMarkdown(lines[i]).trim();
    if (!c || GEMMA_LINE.test(c)) { i++; } else { break; }
  }
  return lines.slice(i);
}

function splitAtNumberedBoundaries(line: string): string[] {
  const parts = line.split(/(?<=[।॥.!?\s])(?=[१२३४५६७८९\d]+[.)।]\s)/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

const SUTRA_END    = /[।॥]\s*\d+\s*[।॥]\s*$/;          // ends with ।।N।।
const ANVAYARTHA  = /^(?:अन्वयार्थ\s*[:-]|Meaning\s*[:-]|अर्थ\s*[:-])/i;
const COMMENTARY  = /^(?:सर्वार्थसिद्धि\s*[:-]|राजवार्तिक\s*[:-]|टीका\s*[:-]|विवेचन\s*[:-])/i;

function renderLines(lines: string[]): ReactNode[] {
  const segments: string[] = [];
  for (const raw of trimPreamble(lines)) {
    const cleaned = stripMarkdown(raw);
    if (shouldSkip(cleaned)) continue;
    splitAtNumberedBoundaries(cleaned).forEach((s) => segments.push(s));
  }
  return segments.map((seg, i) => {
    if (SUTRA_END.test(seg)) {
      // Sutra/verse text — centered, larger, highlighted
      return (
        <p key={i} className="my-4 text-center font-semibold text-purple-900 border-l-4 border-purple-400 pl-3 bg-purple-50 py-2 rounded-r">
          {seg}
        </p>
      );
    }
    if (ANVAYARTHA.test(seg)) {
      // Translation/meaning — indented, muted color
      return <p key={i} className="my-2 pl-4 text-gray-700 italic border-l-2 border-gray-200">{seg}</p>;
    }
    if (COMMENTARY.test(seg)) {
      // Commentary header
      return <p key={i} className="mt-5 mb-1 font-bold text-green-800 text-sm">{seg}</p>;
    }
    if (NUMBERED_START.test(seg)) {
      return <p key={i} className="mt-5 mb-1 font-semibold">{seg}</p>;
    }
    return <p key={i} className="mb-2 text-justify">{seg}</p>;
  });
}

export default function TextPageReader({ scriptureId, jumpToPage, onPageChange, isMaintainer }: TextPageReaderProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  // Fetch pages only when scripture changes
  useEffect(() => {
    setLoading(true);
    setCurrent(0);
    fetch(`/api/scriptures/${scriptureId}/pages`)
      .then((r) => r.json())
      .then((d) => setPages(d.pages ?? []))
      .finally(() => setLoading(false));
  }, [scriptureId]);

  // Jump when jumpToPage or pages change (no refetch)
  useEffect(() => {
    if (!jumpToPage || !pages.length) return;
    const idx = pages.findIndex((p) => p.pageNumber === jumpToPage);
    if (idx !== -1) setCurrent(idx);
  }, [jumpToPage, pages]);

  // Report page changes to parent — ref keeps onPageChange stable, dep on current only
  useEffect(() => {
    if (!loading && pages.length > 0) {
      onPageChangeRef.current?.(pages[current].pageNumber);
    }
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
    setSaving(true);
    setSaveError(null);
    try {
      const token = await user.getIdToken();
      const lines = editText.split("\n").map((l) => l.trim()).filter(Boolean);
      const res = await fetch(`/api/scriptures/${scriptureId}/pages/${pages[current].pageNumber}/correct`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      // Update local state
      setPages((prev) => prev.map((p, i) => i === current ? { ...p, lines } : p));
      setEditMode(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [editText, scriptureId, pages, current]);

  if (loading) {
    return <div className="absolute inset-0 flex items-center justify-center text-gray-400">Loading pages…</div>;
  }
  if (!pages.length) {
    return <div className="absolute inset-0 flex items-center justify-center text-gray-400">No pages found.</div>;
  }

  const page = pages[current];

  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="flex-none flex items-center justify-between px-4 py-2 border-b bg-gray-50 text-sm">
        <span className="text-gray-500">Page {page.pageNumber} / {pages.length}</span>
        <div className="flex items-center gap-3">
          {isMaintainer && !editMode && (
            <button onClick={handleEditOpen} className="px-2 py-0.5 rounded border hover:bg-yellow-50 text-yellow-700 border-yellow-300 text-xs font-medium" title="Edit OCR text">Edit OCR</button>
          )}
          {!editMode && (
            <>
              <button onClick={() => setFontSize((f) => Math.max(12, f - 2))} className="px-2 py-0.5 rounded border hover:bg-gray-100 text-gray-600 font-bold" title="Decrease font size">A−</button>
              <button onClick={() => setFontSize((f) => Math.min(36, f + 2))} className="px-2 py-0.5 rounded border hover:bg-gray-100 text-gray-600 font-bold" title="Increase font size">A+</button>
              <button onClick={() => window.print()} className="px-2 py-0.5 rounded border hover:bg-gray-100 text-gray-600 text-xs" title="Print / Save as PDF">⎙ PDF</button>
            </>
          )}
        </div>
      </div>

      {editMode ? (
        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
          <p className="text-xs text-gray-500">Edit OCR text — one line per paragraph. Save will update Firestore and re-embed the vector.</p>
          <textarea
            className="flex-1 border rounded p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditMode(false)} className="px-3 py-1.5 rounded border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium disabled:opacity-50">
              {saving ? "Saving…" : "Save & Re-embed"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4 text-gray-800 min-h-0" style={{ fontSize: `${fontSize}px`, lineHeight: 1.9, fontFamily: "var(--font-devanagari), 'Noto Sans Devanagari', 'Mangal', serif" }}>
          {renderLines(page.lines)}
        </div>
      )}

      <div className="flex-none flex items-center justify-between px-4 py-3 border-t bg-gray-50">
        <button onClick={() => { setCurrent((c) => Math.max(0, c - 1)); setEditMode(false); }} disabled={current === 0} className="px-4 py-1.5 rounded border text-sm font-medium text-gray-800">← Prev</button>
        <input
          type="number"
          min={1}
          max={pages.length}
          value={page.pageNumber}
          onChange={(e) => {
            const n = parseInt(e.target.value) - 1;
            if (n >= 0 && n < pages.length) { setCurrent(n); setEditMode(false); }
          }}
          className="w-16 text-center border rounded py-1 text-sm"
        />
        <button onClick={() => { setCurrent((c) => Math.min(pages.length - 1, c + 1)); setEditMode(false); }} disabled={current === pages.length - 1} className="px-4 py-1.5 rounded border text-sm font-medium text-gray-800">Next →</button>
      </div>
    </div>
  );
}
