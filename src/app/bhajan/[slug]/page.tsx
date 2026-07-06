import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb } from "../../../../lib/firebaseAdmin";

export const revalidate = 3600;

interface Bhajan {
  title: string;
  lyrics: string;
  category: string;
  slug: string;
}

async function getBhajan(slug: string): Promise<Bhajan | null> {
  const doc = await adminDb.collection("bhajans").doc(decodeURIComponent(slug)).get();
  if (!doc.exists) return null;
  return doc.data() as Bhajan;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bhajan = await getBhajan(slug);
  if (!bhajan) return { title: "Bhajan Not Found | Ask Aagam" };

  const firstLine = bhajan.lyrics.split("\n").find((l) => l.trim()) || "";
  const description = `${bhajan.title} — Jain bhajan lyrics (${bhajan.category}). ${firstLine}`.slice(0, 160);

  return {
    title: `${bhajan.title} Jain Bhajan Lyrics | Ask Aagam`,
    description,
    alternates: { canonical: `https://ask-aagam.vercel.app/bhajan/${bhajan.slug}` },
    openGraph: {
      title: `${bhajan.title} — Jain Bhajan Lyrics`,
      description,
      type: "article",
      url: `https://ask-aagam.vercel.app/bhajan/${bhajan.slug}`,
    },
    twitter: {
      card: "summary",
      title: `${bhajan.title} — Jain Bhajan Lyrics`,
      description,
    },
  };
}

export default async function BhajanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bhajan = await getBhajan(slug);
  if (!bhajan) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    name: bhajan.title,
    genre: "Jain Bhajan",
    inLanguage: "hi",
    lyrics: { "@type": "CreativeWork", text: bhajan.lyrics },
  };

  return (
    <main className="p-3 sm:p-8 font-sans max-w-3xl mx-auto">
      <nav className="text-sm mb-6">
        <Link href="/bhajans" className="text-blue-600 hover:underline">
          ← All Bhajans
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-500">{bhajan.category}</span>
      </nav>
      <h1 className="text-2xl sm:text-3xl font-bold mb-1">{bhajan.title}</h1>
      <p className="text-sm text-gray-500 mb-6">{bhajan.category} · Jain Bhajan</p>
      <div className="whitespace-pre-line leading-relaxed text-lg font-devanagari" style={{ fontFamily: "var(--font-devanagari)" }}>
        {bhajan.lyrics}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
