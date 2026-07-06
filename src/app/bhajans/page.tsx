import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "../../../lib/firebaseAdmin";
import BhajanSearchBox from "../components/BhajanSearchBox";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Jain Bhajans — Lyrics Collection | Ask Aagam",
  description:
    "Browse Jain bhajan lyrics by category — Dev, Shastra, Guru, Dharma, Tirth and more. Read and search Jain devotional songs.",
  alternates: { canonical: "https://ask-aagam.vercel.app/bhajans" },
};

interface BhajanEntry {
  slug: string;
  title: string;
  category: string;
}

async function getAllBhajans(): Promise<BhajanEntry[]> {
  const snapshot = await adminDb.collection("bhajans").select("title", "category", "slug").get();
  return snapshot.docs.map((doc) => doc.data() as BhajanEntry);
}

export default async function BhajansIndexPage() {
  const bhajans = await getAllBhajans();

  const byCategory = bhajans.reduce<Record<string, BhajanEntry[]>>((acc, b) => {
    (acc[b.category] ??= []).push(b);
    return acc;
  }, {});

  const categories = Object.keys(byCategory).sort();

  return (
    <main className="p-3 sm:p-8 font-sans max-w-5xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">Jain Bhajans</h1>
      <p className="text-gray-600 mb-4">
        {bhajans.length} bhajan lyrics across {categories.length} categories.
      </p>
      <BhajanSearchBox />

      {categories.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="text-lg font-semibold mb-3">{cat}</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
            {byCategory[cat]
              .sort((a, b) => a.title.localeCompare(b.title, "hi"))
              .map((b) => (
                <li key={b.slug}>
                  <Link href={`/bhajan/${b.slug}`} className="text-blue-600 hover:underline text-sm">
                    {b.title}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
