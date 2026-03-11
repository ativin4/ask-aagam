"use client";

import { useState } from 'react';
import { Scripture } from './types';

interface EditScriptureModalProps {
  scripture: Scripture;
  onClose: () => void;
  onSave: (id: string, data: any) => Promise<void>;
}

export default function EditScriptureModal({ scripture, onClose, onSave }: EditScriptureModalProps) {
  const [formData, setFormData] = useState({
    title: scripture.title || '',
    writer: scripture.writer || '',
    description: scripture.description || '',
    categories: scripture.categories?.join(', ') || '',
    tikakar: scripture.tikakar?.join(', ') || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(scripture.id, {
        title: formData.title,
        writer: formData.writer,
        description: formData.description,
        categories: formData.categories.split(',').map(s => s.trim()).filter(Boolean),
        tikakar: formData.tikakar.split(',').map(s => s.trim()).filter(Boolean)
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-lg border text-gray-900">
        <h3 className="text-lg font-bold mb-4">Edit Scripture</h3>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              className="w-full p-2 border rounded bg-white"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Writer</label>
            <input
              type="text"
              className="w-full p-2 border rounded bg-white"
              value={formData.writer}
              onChange={e => setFormData({...formData, writer: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="w-full p-2 border rounded bg-white"
              rows={3}
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categories (comma separated)</label>
            <input
              type="text"
              className="w-full p-2 border rounded bg-white"
              value={formData.categories}
              onChange={e => setFormData({...formData, categories: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tikakar (comma separated)</label>
            <input
              type="text"
              className="w-full p-2 border rounded bg-white"
              value={formData.tikakar}
              onChange={e => setFormData({...formData, tikakar: e.target.value})}
            />
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50 text-gray-700"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}