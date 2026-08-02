import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import {
  buildScripturePassages,
  extractChapterNumber,
  extractGathaRange,
} from "../../../../../../../../lib/scripturePassages";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.NEXT_FILE_UPLOAD_CLIENT_EMAIL,
      privateKey: process.env.NEXT_FILE_UPLOAD_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

const HF_API = "https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large";
const QDRANT_COLLECTION = "scripture_pages";

async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch(HF_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: texts.map((text) => `passage: ${text}`) }),
  });
  if (!res.ok) throw new Error(`HF embed failed (${res.status}): ${await res.text()}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("Embedding service returned an unexpected response");
  const vectors: unknown[] = Array.isArray(data[0]) ? data : [data];
  if (!vectors.every((vector) => Array.isArray(vector) && vector.every((value) => typeof value === "number"))) {
    throw new Error("Embedding service returned an unexpected vector format");
  }
  return vectors as number[][];
}

async function ensureQdrantIndex(field: string, schema: "integer" | "keyword") {
  const res = await fetch(
    `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/index`,
    {
      method: "PUT",
      headers: { "api-key": process.env.QDRANT_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ field_name: field, field_schema: schema }),
    }
  );
  if (!res.ok) throw new Error(`Qdrant index failed: ${await res.text()}`);
}

interface IndexedPassage {
  text: string;
  paraNumber: number;
  vector: number[];
  chapterNumber?: number;
  gathaNumber?: string;
  gathaRange?: string;
}

async function oldPagePointIds(bookId: string, pageNumber: number): Promise<string[]> {
  const ids: string[] = [];
  let offset: string | number | undefined;
  do {
    const scrollRes = await fetch(
      `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
      {
        method: "POST",
        headers: { "api-key": process.env.QDRANT_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: { must: [
            { key: "book_id", match: { value: bookId } },
            { key: "page_number", match: { value: pageNumber } },
          ] },
          with_payload: false,
          limit: 256,
          ...(offset !== undefined ? { offset } : {}),
        }),
      }
    );
    if (!scrollRes.ok) throw new Error(`Qdrant scroll failed: ${await scrollRes.text()}`);
    const { result } = await scrollRes.json() as { result: { points: Array<{ id: string }>; next_page_offset?: string | number } };
    ids.push(...result.points.map((point) => point.id));
    offset = result.next_page_offset;
  } while (offset !== undefined && offset !== null);
  return ids;
}

async function replaceQdrantPage(
  bookId: string,
  pageNumber: number,
  passages: IndexedPassage[],
  bookTitle: string,
  categories: string[]
) {
  await Promise.all([
    ensureQdrantIndex("page_number", "integer"),
    ensureQdrantIndex("para_number", "integer"),
  ]);
  const oldIds = await oldPagePointIds(bookId, pageNumber);
  const upsertRes = await fetch(
    `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`,
    {
      method: "PUT",
      headers: { "api-key": process.env.QDRANT_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        points: passages.map((passage) => ({
          id: crypto.randomUUID(),
          vector: passage.vector,
          payload: {
            book_id: bookId,
            book_title: bookTitle,
            page_number: pageNumber,
            para_number: passage.paraNumber,
            paragraph_number: passage.paraNumber,
            categories,
            preview: passage.text.slice(0, 1200),
            ...(passage.chapterNumber ? { chapter_number: passage.chapterNumber } : {}),
            ...(passage.gathaNumber ? { gatha_number: passage.gathaNumber } : {}),
            ...(passage.gathaRange ? { gatha_range: passage.gathaRange } : {}),
          },
        })),
      }),
    }
  );
  if (!upsertRes.ok) throw new Error(`Qdrant upsert failed: ${await upsertRes.text()}`);

  // Upsert new passages before deleting old ones. A transient embedding/Qdrant
  // failure can therefore never make an edited page disappear from search.
  if (oldIds.length) {
    const deleteRes = await fetch(
      `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/delete`,
      {
        method: "POST",
        headers: { "api-key": process.env.QDRANT_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({ points: oldIds }),
      }
    );
    if (!deleteRes.ok) throw new Error(`Qdrant cleanup failed: ${await deleteRes.text()}`);
  }
}

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; pageNum: string }> }
) {
  try {
    const { id: bookId, pageNum } = await props.params;
    const pageNumber = parseInt(pageNum);
    if (isNaN(pageNumber)) return NextResponse.json({ error: "Invalid page number" }, { status: 400 });

    // Auth
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const token = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.maintainer !== true) return NextResponse.json({ error: "Forbidden: Maintainers only" }, { status: 403 });

    const { lines, note } = await request.json();
    if (!Array.isArray(lines) || !lines.every((line) => typeof line === "string")) {
      return NextResponse.json({ error: "lines must be an array of strings" }, { status: 400 });
    }
    const normalizedLines = lines.map((line) => line.trim());
    const newText = normalizedLines.join(" ").trim();
    if (!newText) return NextResponse.json({ error: "a correction cannot be empty" }, { status: 400 });
    if (newText.length > 500_000) {
      return NextResponse.json({ error: "corrected page is too large" }, { status: 400 });
    }

    // Fetch current page text (for corrections record) and scripture metadata
    const [pageSnap, scriptureSnap] = await Promise.all([
      db.collection("scriptures").doc(bookId).collection("pages").doc(String(pageNumber)).get(),
      db.collection("scriptures").doc(bookId).get(),
    ]);

    const pageData = pageSnap.data() ?? {};
    const oldLines: string[] = pageSnap.exists ? (pageData.lines ?? []) : [];
    const scriptureData = scriptureSnap.data() ?? {};
    const bookTitle: string = scriptureData.title ?? bookId;
    const categories: string[] = scriptureData.categories ?? [];

    const passages = buildScripturePassages(normalizedLines);
    if (!passages.length) return NextResponse.json({ error: "no indexable scripture text found" }, { status: 400 });
    if (passages.length > 64) {
      return NextResponse.json({ error: "corrected page produces too many passages; split it into smaller pages first" }, { status: 400 });
    }

    // 1. Embed paragraph-sized passages rather than one page-wide vector. This
    // makes a correction immediately useful for precise philosophical queries.
    const vectors = await embedTexts(passages.map((passage) => passage.text));
    const indexedPassages = passages.map((passage, index) => {
      const extractedChapter = extractChapterNumber(passage.text);
      const gatha = extractGathaRange(passage.text);
      return {
        ...passage,
        vector: vectors[index],
        chapterNumber: extractedChapter ?? pageData.chapterNumber,
        gathaNumber: gatha.first ?? (pageData.sutraNumber ? String(pageData.sutraNumber) : undefined),
        gathaRange: gatha.range,
      };
    });

    // 2. Upsert new points before old points are removed, then update Firestore.
    await replaceQdrantPage(bookId, pageNumber, indexedPassages, bookTitle, categories);

    // 3. Update Firestore page
    await db.collection("scriptures").doc(bookId).collection("pages").doc(String(pageNumber)).set(
      {
        pageNumber,
        lines: normalizedLines,
        passageCount: indexedPassages.length,
        indexingVersion: 2,
        correctedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 4. Write correction record for Gemma learning
    const oldText = oldLines.join(" ");
    if (oldText !== newText) {
      await db.collection("corrections").add({
        book_id: bookId,
        page_number: pageNumber,
        original_text: oldText.slice(0, 1000),
        corrected_text: newText.slice(0, 1000),
        note: note ?? null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        corrected_by: decoded.uid,
      });
    }

    return NextResponse.json({ ok: true, pageNumber });
  } catch (error: unknown) {
    console.error("[OCR Correct]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save correction" }, { status: 500 });
  }
}
