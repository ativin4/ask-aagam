import { NextResponse } from "next/server";
import Fuse from "fuse.js";
import { adminDb } from "../../../../../lib/firebaseAdmin";

interface BhajanEntry {
  slug: string;
  title: string;
  title_hinglish: string;
  category: string;
}

let cache: { data: BhajanEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getAllBhajans(): Promise<BhajanEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const snapshot = await adminDb
    .collection("bhajans")
    .select("title", "title_hinglish", "category", "slug")
    .get();
  const data = snapshot.docs.map((doc) => doc.data() as BhajanEntry);
  cache = { data, fetchedAt: Date.now() };
  return data;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const bhajans = await getAllBhajans();
  const fuse = new Fuse(bhajans, {
    keys: [
      { name: "title", weight: 0.6 },
      { name: "title_hinglish", weight: 0.4 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
  });

  const results = fuse.search(q, { limit: 20 }).map((r) => r.item);
  return NextResponse.json({ results });
}
