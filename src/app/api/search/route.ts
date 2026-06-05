import { NextResponse } from "next/server";
import { expandJainQuery } from "../../../../lib/jainGlossary";

const HF_API = "https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large";
const QDRANT_COLLECTION = "scripture_pages";

async function embedQuery(query: string): Promise<number[]> {
  // e5 models require "query: " prefix for search queries
  const res = await fetch(HF_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: `query: ${query}` }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HuggingFace embedding failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  // HF returns [[...vector...]] for a single input
  return Array.isArray(data[0]) ? data[0] : data;
}

async function searchQdrant(
  vector: number[],
  limit: number,
  filters: Record<string, string[]>
) {
  const must: object[] = [];

  if (filters.scriptureId?.length) {
    must.push({ key: "book_id", match: { value: filters.scriptureId[0] } });
  }
  if (filters.categories?.length) {
    must.push({ key: "categories", match: { any: filters.categories } });
  }

  const body: Record<string, unknown> = {
    vector,
    limit,
    with_payload: true,
  };
  if (must.length) body.filter = { must };

  const res = await fetch(
    `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`,
    {
      method: "POST",
      headers: {
        "api-key": process.env.QDRANT_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qdrant search failed (${res.status}): ${err}`);
  }

  const { result } = await res.json();
  return result as Array<{
    score: number;
    payload: {
      book_id: string;
      book_title: string;
      page_number: number;
      preview: string;
      categories: string[];
    };
  }>;
}

export async function POST(request: Request) {
  try {
    const { query, scriptureId, categories, limit = 10 } = await request.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const vector = await embedQuery(expandJainQuery(query.trim()));
    const hits = await searchQdrant(vector, limit, {
      scriptureId: scriptureId ? [scriptureId] : [],
      categories: categories ?? [],
    });

    function cleanPreview(text: string): string {
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
        .trim();
    }

    const results = hits.map((h) => ({
      score: h.score,
      bookId: h.payload.book_id,
      bookTitle: h.payload.book_title,
      pageNumber: h.payload.page_number,
      preview: cleanPreview(h.payload.preview),
      categories: h.payload.categories,
    }));

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("[Search] Error:", error);
    // HF model cold-start returns 503 — surface it clearly
    if (error.message?.includes("503")) {
      return NextResponse.json(
        { error: "Embedding model is warming up, retry in ~20s" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
