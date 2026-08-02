/** Utilities shared by indexing, retrieval, and citation context construction. */

export interface ScripturePassage {
  paraNumber: number;
  text: string;
}

/** Remove known OCR/model wrappers without changing the scripture itself. */
export function cleanScriptureText(text: string): string {
  return text
    .replace(/^here is the (?:corrected and )?refined text[^:]*:\s*(?:(?:corrected|refined)\s+text:\s*)?/i, "")
    .replace(/^(?:corrected|refined)\s+text:\s*/i, "")
    .replace(/(?:version\s+\S+:\s*)?remember\s+to\s+check\s+\S+[\s\S]*?(?:updares?|updates?)\s*/i, "")
    .replace(/^version\s+[^:\n]+:\s*/im, "")
    .replace(/\n?\*?\s*notes on (?:corrections|refinements)[\s\S]*/i, "")
    .replace(/\n?\*?\s*transliteration[/\w\s]*:[\s\S]*/i, "")
    .replace(/\n?\*?\s*english (?:interpretation|translation)[/\w\s]*:[\s\S]*/i, "")
    .replace(/\(Note:[^)]*\)/gi, "")
    .replace(/^Stanza\s+[\w०-९]+\s*\n?/gim, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/(?:www)\.\S+/gi, "")
    .replace(/^\d{1,4}\s+/, "")
    .replace(/[\u200B\uFEFF]/g, "")
    .trim();
}

function splitLongPassage(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const pieces = text.split(/(?<=[।॥.!?])\s+/).filter(Boolean);
  const result: string[] = [];
  let current = "";

  for (const piece of pieces) {
    if (piece.length > maxChars) {
      if (current) result.push(current);
      for (let start = 0; start < piece.length; start += maxChars) {
        result.push(piece.slice(start, start + maxChars));
      }
      current = "";
    } else if (!current) {
      current = piece;
    } else if (current.length + piece.length + 1 <= maxChars) {
      current += ` ${piece}`;
    } else {
      result.push(current);
      current = piece;
    }
  }
  if (current) result.push(current);
  return result;
}

/**
 * Build compact semantic passages from stored OCR lines. The target size is
 * deliberately smaller than a page: a paragraph-sized vector retrieves a
 * doctrine precisely while preserving enough nearby explanation to answer it.
 */
export function buildScripturePassages(lines: unknown, maxChars = 900): ScripturePassage[] {
  if (!Array.isArray(lines)) return [];

  const blocks: string[] = [];
  let pending: string[] = [];
  const flush = () => {
    const text = cleanScriptureText(pending.join(" "));
    if (text) blocks.push(text);
    pending = [];
  };

  for (const value of lines) {
    if (typeof value !== "string") continue;
    const paragraphs = value.split(/\n\s*\n+/);
    for (const paragraph of paragraphs) {
      const cleaned = cleanScriptureText(paragraph);
      if (!cleaned) {
        flush();
        continue;
      }
      pending.push(cleaned);
    }
  }
  flush();

  const passages: ScripturePassage[] = [];
  let current = "";
  const pushCurrent = () => {
    if (current) passages.push({ paraNumber: passages.length + 1, text: current });
    current = "";
  };

  for (const block of blocks) {
    for (const piece of splitLongPassage(block, maxChars)) {
      if (!current) current = piece;
      else if (current.length + piece.length + 1 <= maxChars) current += ` ${piece}`;
      else {
        pushCurrent();
        current = piece;
      }
    }
  }
  pushCurrent();
  return passages;
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Prefer the indexed passage when it is still available in Firestore. This
 * gives the answering model substantially more evidence than Qdrant's short
 * preview while retaining a focused citation.
 */
export function findPassageExcerpt(
  lines: unknown,
  preview: string,
  paraNumber?: number | null,
  maxChars = 1200
): string | null {
  const passages = buildScripturePassages(lines, maxChars);
  if (!passages.length) return null;

  const needle = normalizeForMatch(cleanScriptureText(preview)).slice(0, 100);
  if (needle) {
    const matched = passages.find((passage) => normalizeForMatch(passage.text).includes(needle));
    if (matched) return matched.text;
  }

  // Older vectors used line-based, zero-indexed paragraph numbers. Use the
  // number only after trying the preview, otherwise it can point at a wholly
  // different paragraph after the current page is rechunked.
  if (typeof paraNumber === "number") {
    const exact = passages.find((p) => p.paraNumber === paraNumber || p.paraNumber - 1 === paraNumber);
    if (exact) return exact.text;
  }

  return null;
}

const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

function toAsciiDigits(value: string): string {
  return [...value].map((char) => DEVANAGARI_DIGITS[char] ?? char).join("");
}

export function extractGathaRange(text: string): { first?: string; range?: string } {
  const matches = [...text.matchAll(/[।॥]{1,2}\s*([०-९0-9]{1,4})\s*[।॥]{1,2}/g)]
    .map((match) => Number(toAsciiDigits(match[1])))
    .filter((value) => Number.isInteger(value) && value > 0 && value < 10000);
  const unique = [...new Set(matches)].sort((a, b) => a - b);
  if (!unique.length) return {};
  const first = String(unique[0]);
  return { first, range: unique.length > 1 ? `${first}–${unique[unique.length - 1]}` : first };
}

export function extractChapterNumber(text: string): number | undefined {
  const match = text.match(/(?:अध्याय|Chapter|प्रकरण|परिच्छेद)\s*[.:]?\s*([०-९0-9]+)/i);
  if (!match) return undefined;
  const value = Number(toAsciiDigits(match[1]));
  return Number.isInteger(value) && value > 0 && value < 1000 ? value : undefined;
}
