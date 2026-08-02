import type { Metadata } from "next";
import Link from "next/link";
import HomeApp from "./components/HomeApp";

export const metadata: Metadata = {
  title: { absolute: "Ask Aagam | Jain Scriptures, Aagams & Bhajans" },
  description:
    "Read and explore Jain scriptures, Aagams, and bhajan lyrics with Ask Aagam's searchable digital library.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Ask Aagam — Jain Scriptures, Aagams & Bhajans",
    description:
      "Read and explore Jain scriptures, Aagams, and bhajan lyrics in a searchable digital library.",
    url: "/",
  },
};

export default function Home() {
  return (
    <HomeApp>
      <section className="mb-6 max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Jain Scriptures, Aagams &amp; Bhajans</h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
          Ask Aagam is a digital library for reading and exploring Jain scriptures, with searchable text and a collection of Jain bhajan lyrics.
          Start with the library below or browse the <Link href="/bhajans" className="text-blue-600 dark:text-blue-400 hover:underline">Jain bhajans</Link>.
        </p>
      </section>
    </HomeApp>
  );
}
