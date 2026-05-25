"use client";

import { Scripture } from "./types";
import { useCallback, useEffect, useRef, useState } from "react";
import TextPageReader from "./TextPageReader";

interface ReaderViewProps {
  scripture: Scripture;
  pdfUrl: string | null;
  isOffline: boolean;
  jumpToPage?: number | null;
  onDownload: (scripture: Scripture) => void;
  onToggleOffline: (scripture: Scripture) => void;
  onClose: (scripture: Scripture) => void;
}

type ViewMode = "ocr" | "pdf";

export default function ReaderView({
  scripture,
  pdfUrl,
  isOffline,
  jumpToPage,
  onDownload,
  onToggleOffline,
  onClose,
}: ReaderViewProps) {
  const isProcessed = scripture.status === "ready";
  const [mounted, setMounted] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("pdf");
  // Tracks current OCR page via ref — avoids feedback loop (no state → no re-render)
  const ocrPageRef = useRef<number | null>(jumpToPage ?? null);
  // PDF URL fragment — only updated when switching OCR→PDF
  const [pdfPageFragment, setPdfPageFragment] = useState<number>(jumpToPage ?? 1);

  useEffect(() => {
    setMounted(true);
    setIsAndroid(/Android/i.test(navigator.userAgent));
  }, []);

  // Reset on scripture change or citation jump
  useEffect(() => {
    setViewMode("pdf");
    ocrPageRef.current = jumpToPage ?? null;
    setPdfPageFragment(jumpToPage ?? 1);
  }, [scripture.id, jumpToPage]);

  // Called by TextPageReader on every page turn — updates ref only, no re-render
  const handlePageChange = useCallback((pageNumber: number) => {
    ocrPageRef.current = pageNumber;
  }, []);

  // When switching modes: capture OCR page into PDF fragment at switch time
  const handleSetViewMode = useCallback((mode: ViewMode) => {
    if (mode === "pdf" && ocrPageRef.current) {
      setPdfPageFragment(ocrPageRef.current);
    }
    setViewMode(mode);
  }, []);

  const pdfUrlAtPage = pdfUrl ? `${pdfUrl}#page=${pdfPageFragment}` : null;

  const showOcr = isProcessed && viewMode === "ocr";
  const showPdf = viewMode === "pdf";

  return (
    <div className="flex-1 flex flex-col min-h-[500px] lg:min-h-0 bg-white rounded-lg shadow-sm border overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center p-3 border-b bg-gray-50">
        <h2 className="font-bold text-gray-800 truncate pr-4">{scripture.title}</h2>
        <div className="flex items-center gap-2">
          {/* OCR / PDF toggle — only when scripture has processed OCR text */}
          {isProcessed && pdfUrl && (
            <div className="flex rounded border overflow-hidden text-xs font-medium">
              <button
                onClick={() => handleSetViewMode("pdf")}
                className={`px-2 py-1 transition ${viewMode === "pdf" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
              >
                PDF
              </button>
              <button
                onClick={() => handleSetViewMode("ocr")}
                className={`px-2 py-1 transition ${viewMode === "ocr" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
              >
                OCR
              </button>
            </div>
          )}

          <button
            onClick={() => onDownload(scripture)}
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
            onClick={() => onToggleOffline(scripture)}
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
            title="Open in browser"
          >
            <span className="lg:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </span>
            <span className="hidden lg:inline">Fullscreen</span>
          </a>
          <button
            onClick={() => onClose(scripture)}
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

      {/* Content */}
      <div className="relative bg-gray-100 overflow-hidden h-[65dvh] lg:flex-1 lg:min-h-0">
        {/* OCR text view — always mounted when processed so page position survives PDF↔OCR toggle */}
        {isProcessed && (
          <div className={`absolute inset-0 ${viewMode === "ocr" ? "block" : "hidden"}`}>
            <TextPageReader
              scriptureId={scripture.id}
              jumpToPage={jumpToPage}
              onPageChange={handlePageChange}
            />
          </div>
        )}

        {/* PDF rendering — deferred until mounted (avoids SSR/client hydration mismatch) */}
        {mounted && showPdf && pdfUrlAtPage && !isAndroid && (
          <object
            key={pdfUrlAtPage}
            data={pdfUrlAtPage}
            type="application/pdf"
            className="absolute inset-0 w-full h-full"
          >
            <PdfFallback pdfUrl={pdfUrl!} onDownload={() => onDownload(scripture)} />
          </object>
        )}

        {mounted && showPdf && isAndroid && pdfUrl && !pdfUrl.startsWith("blob:") && (
          <iframe
            key={pdfUrl}
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`}
            className="absolute inset-0 w-full h-full border-0"
            title={scripture.title}
          />
        )}
        {mounted && showPdf && isAndroid && pdfUrl?.startsWith("blob:") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-gray-600">
            <p className="text-sm">Offline PDF can&apos;t be embedded on Android.</p>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 text-center">
                Open PDF in Browser
              </a>
              <button onClick={() => onDownload(scripture)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
                Download PDF
              </button>
            </div>
          </div>
        )}

        {/* No PDF available and not processed */}
        {!isProcessed && !pdfUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            No content available.
          </div>
        )}
      </div>
    </div>
  );
}

function PdfFallback({ pdfUrl, onDownload }: { pdfUrl: string; onDownload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 text-center gap-3">
      <p>Unable to display PDF in this browser.</p>
      <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700">
        Open PDF in Browser
      </a>
      <button onClick={onDownload} className="text-blue-600 hover:underline text-sm">Download PDF</button>
    </div>
  );
}
