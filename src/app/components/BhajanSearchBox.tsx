'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface BhajanResult {
  slug: string;
  title: string;
  category: string;
}

export default function BhajanSearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BhajanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/bhajans/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results || []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="mb-8 relative">
      <div className="relative">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bhajans... Hindi or Hinglish, e.g. 'antar mein anand aayo'"
          className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl pl-10 pr-4 py-2.5 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500"
        />
      </div>
      {loading && <p className="text-xs text-gray-400 mt-2">Searching...</p>}
      {results.length > 0 && (
        <ul className="mt-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 shadow-lg overflow-hidden">
          {results.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/bhajan/${r.slug}`}
                className="block px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm transition-colors"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">{r.title}</span>{' '}
                <span className="text-gray-400 dark:text-gray-500 text-xs">— {r.category}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && query.trim() && results.length === 0 && (
        <p className="text-xs text-gray-400 mt-2">No bhajans found.</p>
      )}
    </div>
  );
}
