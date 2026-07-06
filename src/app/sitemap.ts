import type { MetadataRoute } from "next";
import { adminDb } from "../../lib/firebaseAdmin";

const BASE_URL = "https://ask-aagam.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const bhajanSnap = await adminDb.collection("bhajans").select("slug").get();

  const bhajanUrls: MetadataRoute.Sitemap = bhajanSnap.docs.map((doc) => ({
    url: `${BASE_URL}/bhajan/${encodeURIComponent(doc.data().slug)}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // NOTE: /scripture/[id] is currently the auth-gated maintainer dashboard, not a
  // public reading page — excluded until a public scripture reader route exists.

  return [
    { url: BASE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/bhajans`, changeFrequency: "daily", priority: 0.9 },
    ...bhajanUrls,
  ];
}
