'use client';

import { useState, useEffect } from 'react';
import { auth } from '../../../../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Scripture } from '../../components/types';

export default function MaintainerDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [scriptures, setScriptures] = useState<Scripture[]>([]);
  const [editingScripture, setEditingScripture] = useState<Scripture | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    writer: '',
    description: '',
    categories: '',
    tikakar: ''
  });
  const router = useRouter();

  const fetchScriptures = async () => {
    try {
      const res = await fetch('/api/scriptures');
      const data = await res.json();
      if (data.scriptures) {
        setScriptures(data.scriptures);
      }
    } catch (error) {
      console.error("Error fetching scriptures:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Force token refresh to get the latest claims
        const token = await currentUser.getIdTokenResult(true);
        if (token.claims.maintainer) {
          setUser(currentUser);
          fetchScriptures();
        } else {
          setLogs((prev) => [...prev, 'Access Denied: User is not a maintainer.']);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    setLogs((prev) => [...prev, 'Starting sync...']);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/backfill', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Sync failed');
      }

      setLogs((prev) => [...prev, `Sync complete. Processed ${data.results.length} files.`]);
      console.log('Sync results:', data.results);
    } catch (error: any) {
      setLogs((prev) => [...prev, `Error: ${error.message}`]);
    } finally {
      setSyncing(false);
    }
  };

  const handleEditClick = (scripture: Scripture) => {
    setEditingScripture(scripture);
    setFormData({
      title: scripture.title || '',
      writer: scripture.writer || '',
      description: scripture.description || '',
      categories: scripture.categories?.join(', ') || '',
      tikakar: scripture.tikakar?.join(', ') || ''
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScripture || !user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/scriptures/${editingScripture.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title,
          writer: formData.writer,
          description: formData.description,
          categories: formData.categories.split(',').map(s => s.trim()).filter(Boolean),
          tikakar: formData.tikakar.split(',').map(s => s.trim()).filter(Boolean)
        })
      });

      if (!response.ok) throw new Error('Update failed');
      
      setEditingScripture(null);
      fetchScriptures();
      setLogs(prev => [...prev, `Updated ${formData.title}`]);
    } catch (error: any) {
      setLogs(prev => [...prev, `Error updating: ${error.message}`]);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!user) return <div className="p-8 text-red-500">Access Denied. You must be a maintainer.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Maintainer Dashboard</h1>

      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Database Synchronization</h2>
        <p className="text-muted-foreground mb-4">
          Scan Google Cloud Storage for new files and register them in Firestore.
        </p>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync GCS to Firestore'}
        </button>

        {logs.length > 0 && (
          <div className="mt-6 bg-muted p-4 rounded text-sm font-mono h-64 overflow-y-auto border">
            {logs.map((log, i) => (
              <div key={i} className="mb-1 border-b border-border/50 pb-1 last:border-0">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 bg-card border rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Scriptures</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted/50">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Writer</th>
                <th className="px-4 py-3">Categories</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scriptures.map((scripture) => (
                <tr key={scripture.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{scripture.title}</td>
                  <td className="px-4 py-3">{scripture.writer || '-'}</td>
                  <td className="px-4 py-3">{scripture.categories?.join(', ') || '-'}</td>
                  <td className="px-4 py-3">
                    <button 
                      onClick={() => handleEditClick(scripture)}
                      className="text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingScripture && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background p-6 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-lg border">
            <h3 className="text-lg font-bold mb-4">Edit Scripture</h3>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input type="text" className="w-full p-2 border rounded bg-background" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Writer</label>
                <input type="text" className="w-full p-2 border rounded bg-background" value={formData.writer} onChange={e => setFormData({...formData, writer: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea className="w-full p-2 border rounded bg-background" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Categories (comma separated)</label>
                <input type="text" className="w-full p-2 border rounded bg-background" value={formData.categories} onChange={e => setFormData({...formData, categories: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tikakar (comma separated)</label>
                <input type="text" className="w-full p-2 border rounded bg-background" value={formData.tikakar} onChange={e => setFormData({...formData, tikakar: e.target.value})} />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setEditingScripture(null)} className="px-4 py-2 border rounded hover:bg-muted">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}