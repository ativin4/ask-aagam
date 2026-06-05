import { NextResponse } from "next/server";
import * as admin from "firebase-admin";

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

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(HF_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: `passage: ${text}` }),
  });
  if (!res.ok) throw new Error(`HF embed failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data[0]) ? data[0] : data;
}

async function ensureQdrantIndex(field: string, schema: "integer" | "keyword") {
  await fetch(
    `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/index`,
    {
      method: "PUT",
      headers: { "api-key": process.env.QDRANT_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ field_name: field, field_schema: schema }),
    }
  );
}

async function replaceQdrantPage(bookId: string, pageNumber: number, vector: number[], preview: string, bookTitle: string, categories: string[]) {
  await ensureQdrantIndex("page_number", "integer");
  // Scroll to find existing point IDs for this page
  const scrollRes = await fetch(
    `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
    {
      method: "POST",
      headers: { "api-key": process.env.QDRANT_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: {
          must: [
            { key: "book_id", match: { value: bookId } },
            { key: "page_number", match: { value: pageNumber } },
          ],
        },
        with_payload: false,
        limit: 10,
      }),
    }
  );
  if (!scrollRes.ok) throw new Error(`Qdrant scroll failed: ${await scrollRes.text()}`);
  const { result } = await scrollRes.json();
  const oldIds: string[] = result.points.map((p: { id: string }) => p.id);

  // Delete old points
  if (oldIds.length) {
    const delRes = await fetch(
      `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/delete`,
      {
        method: "POST",
        headers: { "api-key": process.env.QDRANT_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({ points: oldIds }),
      }
    );
    if (!delRes.ok) throw new Error(`Qdrant delete failed: ${await delRes.text()}`);
  }

  // Insert new point
  const newId = crypto.randomUUID();
  const upsertRes = await fetch(
    `${process.env.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`,
    {
      method: "PUT",
      headers: { "api-key": process.env.QDRANT_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        points: [{
          id: newId,
          vector,
          payload: { book_id: bookId, book_title: bookTitle, page_number: pageNumber, categories, preview },
        }],
      }),
    }
  );
  if (!upsertRes.ok) throw new Error(`Qdrant upsert failed: ${await upsertRes.text()}`);
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
    if (!Array.isArray(lines)) return NextResponse.json({ error: "lines must be an array" }, { status: 400 });

    // Fetch current page text (for corrections record) and scripture metadata
    const [pageSnap, scriptureSnap] = await Promise.all([
      db.collection("scriptures").doc(bookId).collection("pages").doc(String(pageNumber)).get(),
      db.collection("scriptures").doc(bookId).get(),
    ]);

    const oldLines: string[] = pageSnap.exists ? (pageSnap.data()?.lines ?? []) : [];
    const scriptureData = scriptureSnap.data() ?? {};
    const bookTitle: string = scriptureData.title ?? bookId;
    const categories: string[] = scriptureData.categories ?? [];

    const newText = lines.join(" ");
    const preview = newText.slice(0, 400);

    // 1. Embed new text
    const vector = await embedText(newText);

    // 2. Update Qdrant (fail fast — Firestore update only after this succeeds)
    await replaceQdrantPage(bookId, pageNumber, vector, preview, bookTitle, categories);

    // 3. Update Firestore page
    await db.collection("scriptures").doc(bookId).collection("pages").doc(String(pageNumber)).set(
      { pageNumber, lines, correctedAt: admin.firestore.FieldValue.serverTimestamp() },
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
  } catch (error: any) {
    console.error("[OCR Correct]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
