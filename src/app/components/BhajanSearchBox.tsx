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
    <div className="mb-8">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search bhajans... (Hindi or Hinglish, e.g. 'antar mein anand aayo')"
        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {loading && <p className="text-xs text-gray-400 mt-2">Searching...</p>}
      {results.length > 0 && (
        <ul className="mt-3 border border-gray-200 rounded-lg divide-y">
          {results.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/bhajan/${r.slug}`}
                className="block px-4 py-2 hover:bg-gray-50 text-sm"
              >
                <span className="font-medium">{r.title}</span>{' '}
                <span className="text-gray-400 text-xs">— {r.category}</span>
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
