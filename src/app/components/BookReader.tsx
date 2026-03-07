"use client";

import { useState, useEffect } from "react";
import { saveBookOffline, getBookOffline, deleteBookOffline, getOfflineBookIds } from "../../../lib/db";
import { Book } from "./types";
import BookListTable from "./BookListTable";
import BookListCards from "./BookListCards";
import CompactBookList from "./CompactBookList";

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
        try {
        const res = await fetch("/api/books");
        if (res.ok) {
            const data = await res.json();
            setAvailableBooks(data.books);
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

  return (
    <div className={isReading ? "flex flex-col lg:flex-row gap-6 lg:h-[80vh]" : "space-y-6"}>
      {/* Left Column: Navigation / List */}
      <div className={isReading ? "w-full lg:w-1/3 xl:w-1/4 flex flex-col min-h-0 lg:h-full" : "space-y-6"}>
        <div className={isReading ? "flex-none space-y-2 mb-2" : "flex gap-4"}>
          <input
            type="text"
            placeholder="Search books..."
            className="w-full p-2 border rounded shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <p className="text-sm text-gray-500 min-h-[20px] truncate">{status}</p>
        </div>

        {isReading ? (
          <>
            <button
              onClick={() => setIsMobileListOpen(!isMobileListOpen)}
              className="lg:hidden w-full mb-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors flex justify-between items-center"
            >
              <span>{isMobileListOpen ? "Hide Book List" : "Switch Book"}</span>
              <span className="text-xs">{isMobileListOpen ? "▲" : "▼"}</span>
            </button>
            <div className={`flex-1 overflow-y-auto border rounded-lg bg-gray-50 shadow-inner ${isMobileListOpen ? 'block max-h-[40vh] lg:max-h-none' : 'hidden lg:block lg:max-h-none'}`}>
            <CompactBookList
              books={filteredBooks}
              currentBookId={currentBookId}
              offlineBookIds={offlineBookIds}
              onRead={handleRead}
            />
          </div>
          </>
        ) : (
          <>
            <BookListTable 
              books={filteredBooks}
              isLoading={isLoadingLibrary}
              currentBookId={currentBookId}
              offlineBookIds={offlineBookIds}
              onRead={handleRead}
              onSaveOffline={handleSaveOffline}
              onDeleteOffline={handleDeleteOffline}
              onDownloadPdf={handleDownloadPdf}
            />
            <BookListCards 
              books={filteredBooks}
              isLoading={isLoadingLibrary}
              currentBookId={currentBookId}
              offlineBookIds={offlineBookIds}
              onRead={handleRead}
              onSaveOffline={handleSaveOffline}
              onDeleteOffline={handleDeleteOffline}
              onDownloadPdf={handleDownloadPdf}
            />
          </>
        )}
      </div>

      {/* Right Column: Reader */}
      {isReading && currentBook && (
        <div className="flex-1 flex flex-col min-h-[500px] lg:min-h-0 bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="flex justify-between items-center p-3 border-b bg-gray-50">
            <h2 className="font-bold text-gray-800 truncate pr-4">
              {currentBook.title}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadPdf(currentBook)}
                className="text-sm text-purple-600 hover:text-purple-800 font-medium px-3 py-1 rounded hover:bg-purple-50 transition border border-transparent hover:border-purple-200"
              >
                Download
              </button>
              {offlineBookIds.has(currentBook.id) ? (
                <button
                  onClick={() => handleDeleteOffline(currentBook)}
                  className="text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1 rounded hover:bg-red-50 transition border border-transparent hover:border-red-200"
                >
                  Remove
                </button>
              ) : (
                <button
                  onClick={() => handleSaveOffline(currentBook)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1 rounded hover:bg-blue-50 transition border border-transparent hover:border-blue-200"
                >
                  Save
                </button>
              )}
              <button 
                onClick={() => handleRead(currentBook)} 
                className="text-sm text-gray-600 hover:text-gray-800 font-medium px-3 py-1 rounded hover:bg-gray-50 transition border border-transparent hover:border-gray-200"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 relative bg-gray-100">
            {pdfUrl && (
              <iframe 
                src={pdfUrl} 
                className="absolute inset-0 w-full h-full" 
                title="PDF Viewer"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
