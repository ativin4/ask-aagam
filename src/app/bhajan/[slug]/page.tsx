import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb } from "../../../../lib/firebaseAdmin";
import CommentSection from "../../components/CommentSection";

export const revalidate = 3600;

interface Bhajan {
  title: string;
  lyrics: string;
  category: string;
  categories?: string[];
  slug: string;
  writer?: string;
  meaning?: string;
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
  if (!bhajan) return { title: "Bhajan Not Found" };

  const firstLine = bhajan.lyrics.split("\n").find((l) => l.trim()) || "";
  const writerPart = bhajan.writer ? ` By ${bhajan.writer}.` : "";
  const categoryLabel = bhajan.categories?.length ? bhajan.categories.join(", ") : bhajan.category;
  const description = `${bhajan.title} — Jain bhajan lyrics (${categoryLabel}).${writerPart} ${firstLine}`.slice(0, 160);
  const canonical = `https://ask-aagam.vercel.app/bhajan/${encodeURIComponent(bhajan.slug)}`;

  return {
    title: `${bhajan.title} Jain Bhajan Lyrics`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${bhajan.title} — Jain Bhajan Lyrics`,
      description,
      type: "article",
      url: canonical,
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

  const categories = bhajan.categories?.length ? bhajan.categories : [bhajan.category];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    name: bhajan.title,
    url: `https://ask-aagam.vercel.app/bhajan/${encodeURIComponent(bhajan.slug)}`,
    genre: "Jain Bhajan",
    inLanguage: "hi",
    lyrics: { "@type": "CreativeWork", text: bhajan.lyrics },
    isPartOf: { "@type": "CollectionPage", name: "Jain Bhajans", url: "https://ask-aagam.vercel.app/bhajans" },
    ...(bhajan.writer ? { composer: { "@type": "Person", name: bhajan.writer } } : {}),
  };

  return (
    <main className="p-3 sm:p-8 font-sans max-w-3xl mx-auto">
      <nav className="flex items-center gap-2 text-sm mb-6 flex-wrap">
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
          ← Granth Library
        </Link>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <Link href="/bhajans" className="text-blue-600 dark:text-blue-400 hover:underline">
          All Bhajans
        </Link>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <span className="text-gray-500 dark:text-gray-400">{categories.join(", ")}</span>
      </nav>

      <div className="mb-6">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {categories.map((cat) => (
            <span
              key={cat}
              className="inline-block text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            >
              {cat}
            </span>
          ))}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: "var(--font-devanagari)" }}>
          {bhajan.title}
        </h1>
        {bhajan.writer && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">रचयिता: {bhajan.writer}</p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-5 sm:p-8">
        <div
          className="whitespace-pre-line leading-loose text-lg sm:text-xl text-gray-800 dark:text-gray-100"
          style={{ fontFamily: "var(--font-devanagari)" }}
        >
          {bhajan.lyrics}
        </div>
      </div>

      {bhajan.meaning && (
        <div className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-5 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-3">
            अर्थ (Meaning)
          </h2>
          <div
            className="whitespace-pre-line leading-relaxed text-base text-gray-700 dark:text-gray-200"
            style={{ fontFamily: "var(--font-devanagari)" }}
          >
            {bhajan.meaning}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-600 mt-6">
        Jain Bhajan · {categories.join(", ")}
      </p>

      <CommentSection slug={bhajan.slug} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
