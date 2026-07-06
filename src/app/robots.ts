import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/scripture/", "/profile/"],
    },
    sitemap: "https://ask-aagam.vercel.app/sitemap.xml",
  };
}
