import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from './components/ServiceWorkerRegister';
import { Analytics } from "@vercel/analytics/next";

const siteUrl = new URL("https://ask-aagam.vercel.app");
const siteDescription = "Read and explore Jain scriptures, Aagams, and bhajan lyrics with Ask Aagam's searchable digital library.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Ask Aagam | Jain Scriptures & Bhajans",
    template: "%s | Ask Aagam",
  },
  description: siteDescription,
  applicationName: "Ask Aagam",
  keywords: ["Jain scriptures", "Jain Aagams", "Jain bhajans", "Jainism", "Jain library"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: "Ask Aagam",
    title: "Ask Aagam | Jain Scriptures & Bhajans",
    description: siteDescription,
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Ask Aagam" }],
  },
  twitter: {
    card: "summary",
    title: "Ask Aagam | Jain Scriptures & Bhajans",
    description: siteDescription,
    images: ["/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ask Aagam',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-apple.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoDevanagari.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Ask Aagam",
              url: siteUrl.href,
              description: siteDescription,
              inLanguage: ["en", "hi"],
            }),
          }}
        />
        <ServiceWorkerRegister />
        <Analytics />
        {children}
      </body>
    </html>
  );
}
