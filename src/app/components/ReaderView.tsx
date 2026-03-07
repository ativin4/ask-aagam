"use client";

import { Book } from "./types";

interface ReaderViewProps {
  book: Book;
  pdfUrl: string | null;
  isOffline: boolean;
  onDownload: (book: Book) => void;
  onToggleOffline: (book: Book) => void;
  onClose: (book: Book) => void;
}

export default function ReaderView({
  book,
  pdfUrl,
  isOffline,
  onDownload,
  onToggleOffline,
  onClose,
}: ReaderViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-[500px] lg:min-h-0 bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="flex justify-between items-center p-3 border-b bg-gray-50">
        <h2 className="font-bold text-gray-800 truncate pr-4">
          {book.title}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDownload(book)}
            className="text-sm text-purple-600 hover:text-purple-800 font-medium px-3 py-1 rounded hover:bg-purple-50 transition border border-transparent hover:border-purple-200"
            title="Download PDF"
          >
            <span className="lg:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 10.5l4.5 4.5m0 0l4.5-4.5m-4.5 4.5v-10.5" />
              </svg>
            </span>
            <span className="hidden lg:inline">Download</span>
          </button>
          <button
            onClick={() => onToggleOffline(book)}
            className={`text-sm font-medium px-3 py-1 rounded transition border border-transparent lg:w-24 lg:text-center ${
              isOffline 
                ? "text-red-600 hover:text-red-800 hover:bg-red-50 hover:border-red-200" 
                : "text-blue-600 hover:text-blue-800 hover:bg-blue-50 hover:border-blue-200"
            }`}
            title={isOffline ? "Remove from Offline" : "Save Offline"}
          >
            <span className="lg:hidden">
              {isOffline ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                </svg>
              )}
            </span>
            <span className="hidden lg:inline">{isOffline ? "Remove" : "Save"}</span>
          </button>
          <a 
            href={pdfUrl || "#"} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1 rounded hover:bg-blue-50 transition border border-transparent hover:border-blue-200 flex items-center"
            title="Open Fullscreen"
          >
            <span className="lg:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </span>
            <span className="hidden lg:inline">Fullscreen</span>
          </a>
          <button 
            onClick={() => onClose(book)} 
            className="text-sm text-gray-600 hover:text-gray-800 font-medium px-3 py-1 rounded hover:bg-gray-50 transition border border-transparent hover:border-gray-200"
            title="Close"
          >
            <span className="lg:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </span>
            <span className="hidden lg:inline">Close</span>
          </button>
        </div>
      </div>
      <div className="flex-1 relative bg-gray-100">
        {pdfUrl && (
          <>
            <object 
              data={pdfUrl} 
              type="application/pdf"
              className="absolute inset-0 w-full h-full" 
            >
              <p className="flex items-center justify-center h-full text-gray-500">Unable to display PDF. Please use the Download or Fullscreen button.</p>
            </object>
          </>
        )}
      </div>
    </div>
  );
}