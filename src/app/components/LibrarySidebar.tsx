"use client";

import { Book } from "./types";
import BookListTable from "./BookListTable";
import BookListCards from "./BookListCards";
import CompactBookList from "./CompactBookList";

interface LibrarySidebarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  status: string;
  isReading: boolean;
  isMobileListOpen: boolean;
  onToggleMobileList: () => void;
  filteredBooks: Book[];
  currentBookId: string | null;
  offlineBookIds: Set<string>;
  isLoadingLibrary: boolean;
  onRead: (book: Book) => void;
  onSaveOffline: (book: Book) => void;
  onDeleteOffline: (book: Book) => void;
  onDownloadPdf: (book: Book) => void;
}

export default function LibrarySidebar({
  searchTerm,
  onSearchChange,
  status,
  isReading,
  isMobileListOpen,
  onToggleMobileList,
  filteredBooks,
  currentBookId,
  offlineBookIds,
  isLoadingLibrary,
  onRead,
  onSaveOffline,
  onDeleteOffline,
  onDownloadPdf,
}: LibrarySidebarProps) {
  return (
    <div className={isReading ? "w-full lg:w-1/3 xl:w-1/4 flex flex-col min-h-0 lg:h-full" : "space-y-6"}>
      <div className={isReading ? "flex-none space-y-2 mb-2" : "flex flex-col gap-2"}>
        <input
          type="text"
          placeholder="Search books..."
          className="w-full p-2 border rounded shadow-sm"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <p className="text-sm text-gray-500 min-h-[20px] truncate">{status}</p>
      </div>

      {isReading ? (
        <>
          <button
            onClick={onToggleMobileList}
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
              onRead={onRead}
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
            onRead={onRead}
            onSaveOffline={onSaveOffline}
            onDeleteOffline={onDeleteOffline}
            onDownloadPdf={onDownloadPdf}
          />
          <BookListCards 
            books={filteredBooks}
            isLoading={isLoadingLibrary}
            currentBookId={currentBookId}
            offlineBookIds={offlineBookIds}
            onRead={onRead}
            onSaveOffline={onSaveOffline}
            onDeleteOffline={onDeleteOffline}
            onDownloadPdf={onDownloadPdf}
          />
        </>
      )}
    </div>
  );
}