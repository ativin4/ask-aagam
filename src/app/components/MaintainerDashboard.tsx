"use client";

import { useState } from "react";
import { User } from "firebase/auth";

interface MaintainerDashboardProps {
  user: User | null;
}

export default function MaintainerDashboard({ user }: MaintainerDashboardProps) {
  const [targetEmail, setTargetEmail] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        setUploadFiles(Array.from(e.target.files));
    }
    };

    const handleUpload = async () => {
    if (uploadFiles.length === 0 || !user) return;
    setUploadStatus("Requesting secure upload links...");

    try {
        const token = await user.getIdToken();
        
        const urlResponse = await fetch("/api/scriptures", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
            files: uploadFiles.map(f => ({ fileName: f.name, fileType: f.type }))
        })
        });

        if (!urlResponse.ok) throw new Error("Failed to get upload authorization");
        const { signedUrls } = await urlResponse.json();

        setUploadStatus("Uploading files to Google Cloud Storage...");

        // 2. Upload the files directly to GCS using the Signed URLs
        await Promise.all(uploadFiles.map(async (file) => {
            const target = signedUrls.find((t: { fileName: string; signedUrl: string }) => t.fileName === file.name);
            if (!target) return;

            const uploadResponse = await fetch(target.signedUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": file.type,
                },
                body: file,
            });

            if (!uploadResponse.ok) throw new Error(`Upload failed for ${file.name}`);
        }));

        setUploadStatus("Uploads complete! Scriptures are now in the library pipeline.");
        setUploadFiles([]); // Clear input

    } catch (error: unknown) {
        console.error(error);
        setUploadStatus(`Error: ${(error as Error).message}`);
    }
    };

  const handleMakeMaintainer = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminStatus("Processing...");

    if (!user) return;

    try {
      // Get the current user's fresh token to prove they are a maintainer
      const token = await user.getIdToken(); 
      
      const response = await fetch("/api/make-maintainer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ email: targetEmail })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error);
      }

      setAdminStatus(data.message);
      setTargetEmail(""); // clear input
    } catch (error: unknown) {
      setAdminStatus(`Error: ${(error as Error).message}`);
    }
  };

  const handleSync = async () => {
    if (!user) return;
    setUploadStatus("Syncing library with storage...");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/sync-scriptures", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sync failed");
      setUploadStatus(data.message);
    } catch (error: unknown) {
      setUploadStatus(`Error: ${(error as Error).message}`);
    }
  };

  return (
    <div className="mb-8 p-6 bg-yellow-50 border border-yellow-200 rounded">
      <h2 className="text-xl font-bold text-yellow-800 mb-4">Maintainer Dashboard</h2>
      {/* Inside the isMaintainer && (...) block */}
    <div className="bg-white p-4 rounded shadow-sm mt-4">
        <h3 className="font-semibold text-gray-700 mb-2">Upload Scripture (PDF)</h3>
        <p className="text-sm text-gray-500 mb-4">Raw PDFs will be stored and queued for AI extraction.</p>
        
        <div className="flex flex-col gap-4 max-w-sm">
            <input 
            type="file" 
            multiple
            accept="application/pdf"
            onChange={handleFileChange}
            className="border border-gray-300 p-2 rounded"
            />
            <button 
            onClick={handleUpload}
            disabled={uploadFiles.length === 0}
            className="bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded shadow transition"
            >
            Upload
            </button>
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-100">
            <button 
              onClick={handleSync}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Sync Library from Storage (Fix missing scriptures)
            </button>
        </div>
        {uploadStatus && <p className="mt-3 text-sm font-medium text-blue-700">{uploadStatus}</p>}
    </div>
      <div className="bg-white p-4 rounded shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-2">Promote a User</h3>
        <p className="text-sm text-gray-500 mb-4">Grant another registered user maintainer privileges by entering their email address.</p>
        
        <form onSubmit={handleMakeMaintainer} className="flex flex-col sm:flex-row gap-4">
          <input 
            type="email" 
            placeholder="user@example.com" 
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
            className="border border-gray-300 p-2 rounded w-full sm:w-64 text-gray-900 bg-white"
            required
          />
          <button 
            type="submit" 
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded transition w-full sm:w-auto"
          >
            Make Maintainer
          </button>
        </form>
        
        {adminStatus && <p className="mt-3 text-sm font-medium text-blue-700">{adminStatus}</p>}
      </div>
    </div>
  );
}
