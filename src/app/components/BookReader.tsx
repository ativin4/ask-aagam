"use client";

import { useState, useEffect } from "react";
import { saveBookOffline, getBookOffline, deleteBookOffline, getOfflineBookIds } from "../../../lib/db";
import { Book } from "./types";
import LibrarySidebar from "./LibrarySidebar";
import ReaderView from "./ReaderView";

export default function BookReader() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [availableBooks, setAvailableBooks] = useState<Book[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [offlineBookIds, setOfflineBookIds] = useState<Set<string>>(new Set());
  const [isMobileListOpen, setIsMobileListOpen] = useState(false);

  useEffect(() => {
    const fetchLibrary = async () => {
        // 1. Try loading from local storage first for offline support
        const cached = localStorage.getItem("book_library_cache");
        if (cached) {
            setAvailableBooks(JSON.parse(cached));
            setIsLoadingLibrary(false);
        }

        try {
            const res = await fetch("/api/books");
            if (res.ok) {
                const data = await res.json();
                setAvailableBooks(data.books);
                // 2. Update cache with fresh data
                localStorage.setItem("book_library_cache", JSON.stringify(data.books));
            }
        } catch (error) {
            console.error("Failed to load library", error);
        } finally {
            setIsLoadingLibrary(false);
        }
    };

    const checkOfflineBooks = async () => {
      try {
        const keys = await getOfflineBookIds();
        setOfflineBookIds(new Set(keys.map(k => String(k))));
      } catch (error) {
        console.error("Failed to check offline books", error);
      }
    };

    fetchLibrary();
    checkOfflineBooks();
    },[]);

  const filteredBooks = availableBooks.filter(book => 
    book.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveOffline = async (book: Book) => {
    setStatus(`Fetching ${book.title} from server...`);
    try {
      const response = await fetch(book.url);
      if (!response.ok) throw new Error("Network response was not ok");
      
      const blob = await response.blob();

      setStatus("Saving PDF to device for offline reading...");
      await saveBookOffline({ 
        id: book.id, 
        title: book.title, 
        fileBlob: blob 
      });
      
      setOfflineBookIds(prev => new Set(prev).add(book.id));
      setStatus(`${book.title} saved offline successfully!`);
    } catch (error) {
      console.error(error);
      setStatus("Failed to download book.");
    }
  };

  const handleDeleteOffline = async (book: Book) => {
    setStatus(`Removing ${book.title} from offline storage...`);
    try {
      await deleteBookOffline(book.id);
      setOfflineBookIds(prev => {
        const next = new Set(prev);
        next.delete(book.id);
        return next;
      });
      setStatus(`${book.title} removed from offline storage.`);
    } catch (error) {
      console.error(error);
      setStatus("Failed to delete book.");
    }
  };

  const handleDownloadPdf = async (book: Book) => {
    setStatus(`Downloading ${book.title} PDF...`);
    try {
      const response = await fetch(book.url);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${book.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setStatus(`${book.title} PDF downloaded!`);
    } catch (error) {
      console.error(error);
      setStatus(`Failed to download PDF for ${book.title}.`);
    }
  };

  const handleRead = async (book: Book) => {
    if (currentBookId === book.id) {
      setPdfUrl(null);
      setCurrentBookId(null);
      setStatus("");
      return;
    }

    setStatus(`Opening ${book.title}...`);
    const offlineBook = await getBookOffline(book.id);
    
    if (offlineBook && offlineBook.fileBlob) {
      // Convert the offline Blob into a readable URL for the iframe
      const localUrl = URL.createObjectURL(offlineBook.fileBlob);
      setPdfUrl(localUrl);
      setStatus(`Reading ${book.title} (Offline)`);
    } else {
      setPdfUrl(book.url);
      setStatus(`Reading ${book.title} (Online)`);
    }
    setCurrentBookId(book.id);
    setIsMobileListOpen(false);
  };

  const isReading = currentBookId !== null;
  const currentBook = availableBooks.find(b => b.id === currentBookId);

  const handleToggleOffline = (book: Book) => {
    if (offlineBookIds.has(book.id)) {
      handleDeleteOffline(book);
    } else {
      handleSaveOffline(book);
    }
  };

  return (
    <div className={isReading ? "flex flex-col lg:flex-row gap-6 lg:h-[80vh]" : "space-y-6"}>
      <LibrarySidebar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        status={status}
        isReading={isReading}
        isMobileListOpen={isMobileListOpen}
        onToggleMobileList={() => setIsMobileListOpen(!isMobileListOpen)}
        filteredBooks={filteredBooks}
        currentBookId={currentBookId}
        offlineBookIds={offlineBookIds}
        isLoadingLibrary={isLoadingLibrary}
        onRead={handleRead}
        onSaveOffline={handleSaveOffline}
        onDeleteOffline={handleDeleteOffline}
        onDownloadPdf={handleDownloadPdf}
      />

      {isReading && currentBook && (
        <ReaderView
          book={currentBook}
          pdfUrl={pdfUrl}
          isOffline={offlineBookIds.has(currentBook.id)}
          onDownload={handleDownloadPdf}
          onToggleOffline={handleToggleOffline}
          onClose={handleRead}
        />
      )}
    </div>
  );
}
