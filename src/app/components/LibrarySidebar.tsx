"use client";

import { Scripture, VectorSearchResult } from "./types";
import ScriptureListTable from "./ScriptureListTable";
import ScriptureListCards from "./ScriptureListCards";
import CompactScriptureList from "./CompactScriptureList";

interface LibrarySidebarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  status: string;
  isReading: boolean;
  isMobileListOpen: boolean;
  onToggleMobileList: () => void;
  filteredScriptures: Scripture[];
  currentScriptureId: string | null;
  offlineScriptureIds: Set<string>;
  isLoadingLibrary: boolean;
  onRead: (scripture: Scripture) => void;
  onSaveOffline: (scripture: Scripture) => void;
  onDeleteOffline: (scripture: Scripture) => void;
  onDownloadPdf: (scripture: Scripture) => void;
  isMaintainer: boolean;
  onEdit: (scripture: Scripture) => void;
  vectorResults: VectorSearchResult[];
  isSearching: boolean;
}

export default function LibrarySidebar({
  searchTerm,
  onSearchChange,
  status,
  isReading,
  isMobileListOpen,
  onToggleMobileList,
  filteredScriptures,
  currentScriptureId,
  offlineScriptureIds,
  isLoadingLibrary,
  onRead,
  onSaveOffline,
  onDeleteOffline,
  onDownloadPdf,
  isMaintainer,
  onEdit,
  vectorResults,
  isSearching,
}: LibrarySidebarProps) {
  const openAtPage = (bookId: string, pageNumber: number) => {
    window.dispatchEvent(new CustomEvent("openScripture", { detail: { bookId, pageNumber } }));
  };
  return (
    <div className={isReading ? "w-full lg:w-1/3 xl:w-1/4 flex flex-col min-h-0 lg:h-full" : "space-y-6"}>
      {/* Search + status — hidden on mobile when reading (reader has its own search) */}
      <div className={isReading ? "flex-none space-y-2 mb-2 hidden lg:block" : "flex flex-col gap-2"}>
        <input
          id="scripture-search"
          name="search"
          type="text"
          placeholder="Search scriptures or content…"
          className="w-full p-2 border rounded shadow-sm"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <p className="text-sm text-gray-500 min-h-[20px] truncate">{status}</p>

        {/* Vector search results */}
        {isSearching && (
          <div className="text-xs text-gray-400 px-1">Searching content…</div>
        )}
        {!isSearching && vectorResults.length > 0 && (
          <div className="border rounded-lg bg-white shadow divide-y max-h-72 overflow-y-auto">
            <p className="text-xs font-medium text-gray-500 px-3 py-1.5 bg-gray-50">Content matches</p>
            {vectorResults.map((r, i) => (
              <button
                key={i}
                onClick={() => openAtPage(r.bookId, r.pageNumber)}
                className="w-full text-left px-3 py-2 hover:bg-purple-50 transition-colors"
              >
                <div className="text-xs font-semibold text-purple-700 truncate">{r.bookTitle} · p.{r.pageNumber}</div>
                <div className="text-xs text-gray-600 line-clamp-2 mt-0.5">{r.preview}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {isReading ? (
        <>
          <button
            onClick={onToggleMobileList}
            className="lg:hidden w-full mb-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors flex justify-between items-center"
          >
            <span>{isMobileListOpen ? "Hide Scripture List" : "Switch Scripture"}</span>
            <span className="text-xs">{isMobileListOpen ? "▲" : "▼"}</span>
          </button>
          <div className={`flex-1 overflow-y-auto border rounded-lg bg-gray-50 shadow-inner ${isMobileListOpen ? 'block max-h-[40vh] lg:max-h-none' : 'hidden lg:block lg:max-h-none'}`}>
            <CompactScriptureList
              scriptures={filteredScriptures}
              currentScriptureId={currentScriptureId}
              offlineScriptureIds={offlineScriptureIds}
              onRead={onRead}
            />
          </div>
        </>
      ) : (
        <>
          <ScriptureListTable 
            scriptures={filteredScriptures}
            isLoading={isLoadingLibrary}
            currentScriptureId={currentScriptureId}
            offlineScriptureIds={offlineScriptureIds}
            onRead={onRead}
            onSaveOffline={onSaveOffline}
            onDeleteOffline={onDeleteOffline}
            onDownloadPdf={onDownloadPdf}
            isMaintainer={isMaintainer}
            onEdit={onEdit}
          />
          <ScriptureListCards
            scriptures={filteredScriptures}
            isLoading={isLoadingLibrary}
            currentScriptureId={currentScriptureId}
            offlineScriptureIds={offlineScriptureIds}
            onRead={onRead}
            onSaveOffline={onSaveOffline}
            onDeleteOffline={onDeleteOffline}
            onDownloadPdf={onDownloadPdf}
            isMaintainer={isMaintainer}
            onEdit={onEdit}
          />
        </>
      )}
    </div>
  );
}