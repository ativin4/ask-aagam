import { Book } from "./types";

interface CompactBookListProps {
  books: Book[];
  currentBookId: string | null;
  offlineBookIds: Set<string>;
  onRead: (book: Book) => void;
}

export default function CompactBookList({
  books,
  currentBookId,
  offlineBookIds,
  onRead,
}: CompactBookListProps) {
  return (
    <div className="space-y-1 p-1">
      {books.map((book) => (
        <button
          key={book.id}
          onClick={() => onRead(book)}
          className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex justify-between items-center ${
            currentBookId === book.id
              ? "bg-blue-100 text-blue-900 border-blue-200 border"
              : "hover:bg-gray-100 text-gray-700 border border-transparent"
          }`}
        >
          <span className="truncate mr-2">{book.title}</span>
          {offlineBookIds.has(book.id) && (
            <span className="flex-none text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">
              Offline
            </span>
          )}
        </button>
      ))}
      {books.length === 0 && (
        <div className="text-center text-gray-500 py-4 text-sm">
          No books found.
        </div>
      )}
    </div>
  );
}