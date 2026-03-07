import { Book } from "./types";

interface BookListTableProps {
  books: Book[];
  isLoading: boolean;
  currentBookId: string | null;
  offlineBookIds: Set<string>;
  onRead: (book: Book) => void;
  onSaveOffline: (book: Book) => void;
  onDeleteOffline: (book: Book) => void;
  onDownloadPdf: (book: Book) => void;
}

export default function BookListTable({
  books,
  isLoading,
  currentBookId,
  offlineBookIds,
  onRead,
  onSaveOffline,
  onDeleteOffline,
  onDownloadPdf,
}: BookListTableProps) {
  return (
    <div className="hidden md:block border rounded-lg overflow-hidden shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {isLoading ? (
            <tr>
              <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                Loading library...
              </td>
            </tr>
          ) : books.length > 0 ? (
            books.map((book) => (
              <tr key={book.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{book.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <button
                    onClick={() => onRead(book)}
                    className={`${currentBookId === book.id ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"} font-medium`}
                  >
                    {currentBookId === book.id ? "Close" : "Read"}
                  </button>
                  {offlineBookIds.has(book.id) ? (
                    <button
                      onClick={() => onDeleteOffline(book)}
                      className="text-red-600 hover:text-red-900 font-medium"
                    >
                      Delete Offline
                    </button>
                  ) : (
                    <button
                      onClick={() => onSaveOffline(book)}
                      className="text-blue-600 hover:text-blue-900 font-medium"
                    >
                      Save Offline
                    </button>
                  )}
                  <button
                    onClick={() => onDownloadPdf(book)}
                    className="text-purple-600 hover:text-purple-900 font-medium"
                  >
                    Download PDF
                  </button>
                </td>
              </tr>
            ))) : (
            <tr>
              <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                No books found matching your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}