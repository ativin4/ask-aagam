import { Book } from "./types";

interface BookListCardsProps {
  books: Book[];
  isLoading: boolean;
  currentBookId: string | null;
  offlineBookIds: Set<string>;
  onRead: (book: Book) => void;
  onSaveOffline: (book: Book) => void;
  onDeleteOffline: (book: Book) => void;
  onDownloadPdf: (book: Book) => void;
}

export default function BookListCards({
  books,
  isLoading,
  currentBookId,
  offlineBookIds,
  onRead,
  onSaveOffline,
  onDeleteOffline,
  onDownloadPdf,
}: BookListCardsProps) {
  return (
    <div className="md:hidden space-y-4">
      {isLoading ? (
        <div className="text-center text-gray-500 py-8 border-2 border-dashed rounded-lg">
          Loading library...
        </div>
      ) : books.length > 0 ? (
        books.map((book) => (
          <div key={book.id} className="bg-white border rounded-lg shadow-sm p-4 space-y-4">
            <h3 className="font-medium text-gray-900 text-lg">{book.title}</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onRead(book)}
                className={`w-full py-2 px-4 ${currentBookId === book.id ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-green-50 text-green-700 hover:bg-green-100"} rounded-md font-medium transition-colors text-center`}
              >
                {currentBookId === book.id ? "Close" : "Read"}
              </button>
              {offlineBookIds.has(book.id) ? (
                <button
                  onClick={() => onDeleteOffline(book)}
                  className="w-full py-2 px-4 bg-red-50 text-red-700 rounded-md font-medium hover:bg-red-100 transition-colors text-center"
                >
                  Delete Offline
                </button>
              ) : (
                <button
                  onClick={() => onSaveOffline(book)}
                  className="w-full py-2 px-4 bg-blue-50 text-blue-700 rounded-md font-medium hover:bg-blue-100 transition-colors text-center"
                >
                  Save Offline
                </button>
              )}
              <button
                onClick={() => onDownloadPdf(book)}
                className="w-full py-2 px-4 bg-purple-50 text-purple-700 rounded-md font-medium hover:bg-purple-100 transition-colors text-center"
              >
                Download PDF
              </button>
            </div>
          </div>
        ))) : (
        <div className="text-center text-gray-500 py-8 border-2 border-dashed rounded-lg">
          No books found matching your search.
        </div>
      )}
    </div>
  );
}