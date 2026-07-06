'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../../../lib/firebase';

interface Comment {
  id: string;
  text: string;
  userName: string;
  createdAt: string | null;
}

export default function CommentSection({ slug }: { slug: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bhajans/${encodeURIComponent(slug)}/comments`);
      const data = await res.json();
      setComments(data.comments || []);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error('Sign-in failed', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/bhajans/${encodeURIComponent(slug)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to post comment');
      }
      setText('');
      await loadComments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800">
      <h2 className="text-lg font-semibold mb-4">Comments {comments.length > 0 && `(${comments.length})`}</h2>

      {!authLoading && (
        user ? (
          <form onSubmit={handleSubmit} className="mb-6">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Share a thought about this bhajan..."
              rows={3}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500"
            />
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-gray-400">
                Commenting as {user.displayName || user.email}{' '}
                <button type="button" onClick={() => signOut(auth)} className="underline hover:text-gray-600 dark:hover:text-gray-300">
                  sign out
                </button>
              </div>
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
              >
                {submitting ? 'Posting...' : 'Post'}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </form>
        ) : (
          <div className="mb-6 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">Sign in to leave a comment</span>
            <button
              onClick={handleSignIn}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              Sign in with Google
            </button>
          </div>
        )
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-400">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-gray-800 dark:text-gray-100">{c.userName}</span>
                {c.createdAt && (
                  <span className="text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-300 whitespace-pre-line mt-0.5">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
