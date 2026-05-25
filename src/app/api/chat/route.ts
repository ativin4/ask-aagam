import { NextResponse } from "next/server";

const HF_API = "https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large";
const QDRANT_COLLECTION = "scripture_pages";
const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";

async function embedQuery(query: string): Promise<number[]> {
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
    throw new Error(`HF embed failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return Array.isArray(data[0]) ? data[0] : data;
}

async function searchQdrant(vector: number[], limit: number, scriptureId?: string) {
  const must: object[] = [];
  if (scriptureId) {
    must.push({ key: "book_id", match: { value: scriptureId } });
  }

  const body: Record<string, unknown> = { vector, limit, with_payload: true };
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
      paragraph_number?: number;
      preview: string;
      categories: string[];
      gatha_number?: string;
      gatha_range?: string;
      chapter_number?: number;
    };
  }>;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  function enqueue(controller: ReadableStreamDefaultController, data: object | string) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
  }

  try {
    const { query, messages = [], scriptureId } = await request.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const vector = await embedQuery(query.trim());
    const hits = await searchQdrant(vector, 5, scriptureId || undefined);

    if (!hits.length) {
      const stream = new ReadableStream({
        start(controller) {
          enqueue(controller, { type: "token", content: "No relevant passages found for your query in the selected scriptures." });
          enqueue(controller, { type: "citations", data: [] });
          enqueue(controller, "[DONE]");
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    function cleanPreview(text: string): string {
      return text
        // Preamble: "Here is the [corrected and] refined text...: [Corrected/Refined Text:]"
        .replace(/^here is the (?:corrected and )?refined text[^:]*:\s*(?:(?:corrected|refined)\s+text:\s*)?/i, "")
        // Bare "Refined Text:" / "Corrected Text:" prefix
        .replace(/^(?:corrected|refined)\s+text:\s*/i, "")
        // AtmaDharma watermark phrase — preserves content after "updares/updates"
        .replace(/(?:version\s+\S+:\s*)?remember\s+to\s+check\s+\S+[\s\S]*?(?:updares?|updates?)\s*/i, "")
        // Version prefix fallback
        .replace(/^version\s+[^:\n]+:\s*/im, "")
        // Annotation sections
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

    const citations = hits.map((h, i) => ({
      index: i + 1,
      bookId: h.payload.book_id,
      bookTitle: h.payload.book_title,
      pageNumber: h.payload.page_number,
      paragraphNumber: h.payload.paragraph_number ?? null,
      gathaNumber: h.payload.gatha_number ?? null,
      gathaRange: h.payload.gatha_range ?? null,
      chapterNumber: h.payload.chapter_number ?? null,
      preview: cleanPreview(h.payload.preview),
      score: h.score,
    }));

    const context = citations.map((c) => {
      const loc = c.gathaRange
        ? `Gatha ${c.gathaRange}`
        : c.gathaNumber
        ? `Gatha ${c.gathaNumber}`
        : `Page ${c.pageNumber}`;
      const ch = c.chapterNumber ? `, Chapter ${c.chapterNumber}` : "";
      return `[${c.index}] ${c.bookTitle}${ch}, ${loc}:\n${c.preview}`;
    }).join("\n\n---\n\n");

    const systemPrompt = `You are a knowledgeable and reverent assistant for Jain scriptures (Aagams). Answer questions using ONLY the provided scripture passages. Always cite sources using [number] notation. Be accurate, concise, and respectful of the sacred nature of these texts.

SCRIPTURE PASSAGES:
${context}

RULES:
- Use ONLY information from the passages above
- Cite with [1], [2], etc. when referencing a passage
- If the passages don't contain the answer, say so clearly
- Keep responses focused and meaningful`;

    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-6),
      { role: "user", content: query },
    ];

    const groqRes = await fetch(GROQ_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        stream: true,
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      throw new Error(`Groq failed (${groqRes.status}): ${err}`);
    }

    const decoder = new TextDecoder();
    let buffer = "";

    const stream = new ReadableStream({
      async start(controller) {
        const reader = groqRes.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") {
                enqueue(controller, { type: "citations", data: citations });
                enqueue(controller, "[DONE]");
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) enqueue(controller, { type: "token", content });
              } catch {
                // skip malformed chunk
              }
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (error: any) {
    console.error("[Chat]", error);
    if (error.message?.includes("503")) {
      return NextResponse.json({ error: "Embedding model warming up, retry in ~20s" }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
