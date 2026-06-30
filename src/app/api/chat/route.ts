import { NextResponse } from "next/server";
import { expandJainQuery } from "../../../../lib/jainGlossary";

const HF_API = "https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large";
const QDRANT_COLLECTION = "scripture_pages";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";

async function fetchLLMStream(messages: object[]): Promise<Response> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await fetch(GEMINI_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.3,
        }),
      });
      if (res.ok) return res;
    } catch {
      // fall through to Groq
    }
  }
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      stream: true,
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM failed (${res.status}): ${err}`);
  }
  return res;
}

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
      para_number?: number;
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

    const vector = await embedQuery(expandJainQuery(query.trim()));
    const rawHits = await searchQdrant(vector, 15, scriptureId || undefined);
    // Deduplicate by (bookId, pageNumber) — keep highest-scoring hit per page
    const seen = new Set<string>();
    const hits = rawHits
      .filter((h) => h.score >= 0.35)
      .filter((h) => {
        const key = `${h.payload.book_id}:${h.payload.page_number}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);

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
      paraNumber: h.payload.para_number ?? null,
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

    const systemPrompt = `You are a knowledgeable assistant for Jain scriptures and philosophy. Answer using ONLY the retrieved passages provided below — these are from authentic Jain texts including Tattvartha Sutra, Sarvarthasiddhi, and other Aagams.

RETRIEVED PASSAGES:
${context}

RULES:
- Respond in the same language as the user's query. If the query is in Hindi or Hinglish (Hindi written in English letters), respond in proper Hindi (Devanagari script). If English, respond in English.
- Ground every claim in the passages. Cite with [N] inline whenever passage N contributes to your answer.
- For philosophical/technical terms (gunasthanas, bhavas, naya, syadvada, etc.) extract and explain what the passages say — even partial information is valuable.
- If multiple passages address different aspects of the question, synthesize them with citations.
- If passages only partially answer, state what they say and acknowledge what they don't cover.
- If no passage is relevant: "The retrieved passages do not contain information about this topic." (Translate this phrase if responding in Hindi).
- Write in a clear, respectful tone appropriate for scripture study. Use the Sanskrit/Prakrit terms from the text with brief explanations.
- Do NOT cite [N] in a negative context (e.g. "passage N does not say"). Only cite what passages DO say.`;

    const llmMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-6),
      { role: "user", content: query },
    ];

    const llmRes = await fetchLLMStream(llmMessages);

    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        const reader = llmRes.body!.getReader();
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
                // Filter to citations the LLM actually used in positive context
                const used = citations.filter((c) => {
                  const tag = `[${c.index}]`;
                  const idx = fullResponse.indexOf(tag);
                  if (idx === -1) return false;
                  const before = fullResponse.slice(Math.max(0, idx - 60), idx).toLowerCase();
                  return !/(not mention|no mention|do not|does not|don't|doesn't|lack|absent|cannot find)/.test(before);
                });

                // Renumber citations 1…N sequentially so button numbers match text
                let patchedResponse = fullResponse;
                const renumbered = used.map((c, i) => {
                  const newIdx = i + 1;
                  // Replace [oldIdx] → [newIdx] in response text (only if different)
                  if (c.index !== newIdx) {
                    patchedResponse = patchedResponse.replaceAll(`[${c.index}]`, `[${newIdx}]`);
                  }
                  return { ...c, index: newIdx };
                });

                // If any renumbering happened, push a text-patch token before DONE
                if (patchedResponse !== fullResponse) {
                  enqueue(controller, { type: "replace_content", content: patchedResponse });
                }

                enqueue(controller, { type: "citations", data: renumbered });
                enqueue(controller, "[DONE]");
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  enqueue(controller, { type: "token", content });
                }
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
