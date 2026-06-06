"use client";

import { useState, useEffect, useRef } from "react";
import { auth } from "../../../lib/firebase";
import { saveScriptureOffline, getScriptureOffline, deleteScriptureOffline, getOfflineScriptureIds } from "../../../lib/db";
import { Scripture, VectorSearchResult } from "./types";
import LibrarySidebar from "./LibrarySidebar";
import ReaderView from "./ReaderView";
import EditScriptureModal from "./EditScriptureModal";

interface ScriptureReaderProps {
  isMaintainer?: boolean;
}

export default function ScriptureReader({ isMaintainer = false }: ScriptureReaderProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentScriptureId, setCurrentScriptureId] = useState<string | null>(null);
  const [availableScriptures, setAvailableScriptures] = useState<Scripture[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [offlineScriptureIds, setOfflineScriptureIds] = useState<Set<string>>(new Set());
  const [isMobileListOpen, setIsMobileListOpen] = useState(false);
  const [editingScripture, setEditingScripture] = useState<Scripture | null>(null);
  const [jumpToPage, setJumpToPage] = useState<number | null>(null);
  const availableScripturesRef = useRef<Scripture[]>([]);
  const handleReadRef = useRef<((s: Scripture) => void) | null>(null);
  // Keep refs fresh on every render
  availableScripturesRef.current = availableScriptures;
  const [vectorResults, setVectorResults] = useState<VectorSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const fetchLibrary = async () => {
        // 1. Try loading from local storage first for offline support
        const cached = localStorage.getItem("scripture_library_cache");
        if (cached) {
            setAvailableScriptures(JSON.parse(cached));
            setIsLoadingLibrary(false);
        }

        try {
            const res = await fetch("/api/scriptures", { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setAvailableScriptures(data.scriptures);
                // 2. Update cache with fresh data
                localStorage.setItem("scripture_library_cache", JSON.stringify(data.scriptures));
            }
        } catch (error) {
            console.error("Failed to load library", error);
        } finally {
            setIsLoadingLibrary(false);
        }
    };

    const checkOfflineScriptures = async () => {
      try {
        const keys = await getOfflineScriptureIds();
        setOfflineScriptureIds(new Set(keys.map(k => String(k))));
      } catch (error) {
        console.error("Failed to check offline scriptures", error);
      }
    };

    fetchLibrary();
    checkOfflineScriptures();

    const handleOpenScripture = (e: Event) => {
      const { bookId, pageNumber } = (e as CustomEvent).detail;
      setJumpToPage(pageNumber ?? null);
      // Use ref to avoid stale closure — don't call side effects inside setState
      const scripture = availableScripturesRef.current.find((s) => s.id === bookId);
      if (scripture && handleReadRef.current) {
        handleReadRef.current(scripture);
      }
    };
    window.addEventListener("openScripture", handleOpenScripture);
    return () => window.removeEventListener("openScripture", handleOpenScripture);
    },[]);

  useEffect(() => {
    if (searchTerm.length < 3) {
      setVectorResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchTerm, limit: 8 }),
        });
        const data = await res.json();
        setVectorResults(data.results ?? []);
      } catch {
        setVectorResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filteredScriptures = availableScriptures.filter(scripture => 
    scripture.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveOffline = async (scripture: Scripture) => {
    setStatus(`Fetching ${scripture.title} from server...`);
    try {
      const response = await fetch(scripture.url);
      if (!response.ok) throw new Error("Network response was not ok");
      
      const blob = await response.blob();

      setStatus("Saving PDF to device for offline reading...");
      await saveScriptureOffline({ 
        id: scripture.id, 
        title: scripture.title, 
        fileBlob: blob 
      });
      
      setOfflineScriptureIds(prev => new Set(prev).add(scripture.id));
      setStatus(`${scripture.title} saved offline successfully!`);
    } catch (error) {
      console.error(error);
      setStatus("Failed to download scripture.");
    }
  };

  const handleDeleteOffline = async (scripture: Scripture) => {
    setStatus(`Removing ${scripture.title} from offline storage...`);
    try {
      await deleteScriptureOffline(scripture.id);
      setOfflineScriptureIds(prev => {
        const next = new Set(prev);
        next.delete(scripture.id);
        return next;
      });
      setStatus(`${scripture.title} removed from offline storage.`);
    } catch (error) {
      console.error(error);
      setStatus("Failed to delete scripture.");
    }
  };

  const handleDownloadPdf = async (scripture: Scripture) => {
    setStatus(`Downloading ${scripture.title} PDF...`);
    try {
      const response = await fetch(scripture.url);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${scripture.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setStatus(`${scripture.title} PDF downloaded!`);
    } catch (error) {
      console.error(error);
      setStatus(`Failed to download PDF for ${scripture.title}.`);
    }
  };

  handleReadRef.current = (scripture: Scripture) => { handleRead(scripture); };
  const handleRead = async (scripture: Scripture) => {
    if (currentScriptureId === scripture.id) {
      setPdfUrl(null);
      setCurrentScriptureId(null);
      setStatus("");
      return;
    }

    setStatus(`Opening ${scripture.title}...`);
    const offlineScripture = await getScriptureOffline(scripture.id);
    
    if (offlineScripture && offlineScripture.fileBlob) {
      // Convert the offline Blob into a readable URL for the iframe
      const localUrl = URL.createObjectURL(offlineScripture.fileBlob);
      setPdfUrl(localUrl);
      setStatus(`Reading ${scripture.title} (Offline)`);
    } else {
      setPdfUrl(scripture.url);
      setStatus(`Reading ${scripture.title} (Online)`);
    }
    setCurrentScriptureId(scripture.id);
    setIsMobileListOpen(false);
  };

  const isReading = currentScriptureId !== null;
  const currentScripture = availableScriptures.find(b => b.id === currentScriptureId);

  const handleToggleOffline = (scripture: Scripture) => {
    if (offlineScriptureIds.has(scripture.id)) {
      handleDeleteOffline(scripture);
    } else {
      handleSaveOffline(scripture);
    }
  };

  const handleEdit = (scripture: Scripture) => {
    setEditingScripture(scripture);
  };

  const handleSaveScripture = async (id: string, data: any) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    
    const token = await user.getIdToken();
    const response = await fetch(`/api/scriptures/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Update failed');

    // Update local state
    setAvailableScriptures(prev => prev.map(s => 
      s.id === id ? { ...s, ...data } : s
    ));
    setStatus(`Updated ${data.title}`);
  };


  return (
    <div className={isReading ? "flex flex-col lg:flex-row gap-2 lg:gap-6 lg:h-[80vh]" : "space-y-6"}>
      <LibrarySidebar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        status={status}
        isReading={isReading}
        isMobileListOpen={isMobileListOpen}
        onToggleMobileList={() => setIsMobileListOpen(!isMobileListOpen)}
        filteredScriptures={filteredScriptures}
        currentScriptureId={currentScriptureId}
        offlineScriptureIds={offlineScriptureIds}
        isLoadingLibrary={isLoadingLibrary}
        onRead={handleRead}
        onSaveOffline={handleSaveOffline}
        onDeleteOffline={handleDeleteOffline}
        onDownloadPdf={handleDownloadPdf}
        isMaintainer={isMaintainer}
        onEdit={handleEdit}
        vectorResults={vectorResults}
        isSearching={isSearching}
      />

      {isReading && currentScripture && (
        <ReaderView
          scripture={currentScripture}
          pdfUrl={pdfUrl}
          isOffline={offlineScriptureIds.has(currentScripture.id)}
          jumpToPage={jumpToPage}
          isMaintainer={isMaintainer}
          onDownload={handleDownloadPdf}
          onToggleOffline={handleToggleOffline}
          onClose={handleRead}
        />
      )}

      {editingScripture && (
        <EditScriptureModal
          scripture={editingScripture}
          onClose={() => setEditingScripture(null)}
          onSave={handleSaveScripture}
        />
      )}
    </div>
  );
}
