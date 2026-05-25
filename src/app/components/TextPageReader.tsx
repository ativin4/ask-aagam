"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

interface Page {
  pageNumber: number;
  lines: string[];
}

interface TextPageReaderProps {
  scriptureId: string;
  jumpToPage?: number | null;
  onPageChange?: (pageNumber: number) => void;
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

function renderLines(lines: string[]): ReactNode[] {
  const segments: string[] = [];
  for (const raw of trimPreamble(lines)) {
    const cleaned = stripMarkdown(raw);
    if (shouldSkip(cleaned)) continue;
    splitAtNumberedBoundaries(cleaned).forEach((s) => segments.push(s));
  }
  return segments.map((seg, i) => (
    <p key={i} className={NUMBERED_START.test(seg) ? "mt-5 mb-1 font-semibold" : "mb-2 text-justify"}>
      {seg}
    </p>
  ));
}

export default function TextPageReader({ scriptureId, jumpToPage, onPageChange }: TextPageReaderProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fontSize, setFontSize] = useState(18);
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
          <button onClick={() => setFontSize((f) => Math.max(12, f - 2))} className="px-2 py-0.5 rounded border hover:bg-gray-100 text-gray-600 font-bold" title="Decrease font size">A−</button>
          <button onClick={() => setFontSize((f) => Math.min(36, f + 2))} className="px-2 py-0.5 rounded border hover:bg-gray-100 text-gray-600 font-bold" title="Increase font size">A+</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 text-gray-800 min-h-0" style={{ fontSize: `${fontSize}px`, lineHeight: 1.9, fontFamily: "'Noto Sans Devanagari', 'Mangal', serif" }}>
        {renderLines(page.lines)}
      </div>
      <div className="flex-none flex items-center justify-between px-4 py-3 border-t bg-gray-50">
        <button onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0} className="px-4 py-1.5 rounded border text-sm font-medium text-gray-800">← Prev</button>
        <input
          type="number"
          min={1}
          max={pages.length}
          value={page.pageNumber}
          onChange={(e) => {
            const n = parseInt(e.target.value) - 1;
            if (n >= 0 && n < pages.length) setCurrent(n);
          }}
          className="w-16 text-center border rounded py-1 text-sm"
        />
        <button onClick={() => setCurrent((c) => Math.min(pages.length - 1, c + 1))} disabled={current === pages.length - 1} className="px-4 py-1.5 rounded border text-sm font-medium text-gray-800">Next →</button>
      </div>
    </div>
  );
}
