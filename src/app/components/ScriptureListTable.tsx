import { Scripture } from "./types";

interface ScriptureListTableProps {
  scriptures: Scripture[];
  isLoading: boolean;
  currentScriptureId: string | null;
  offlineScriptureIds: Set<string>;
  onRead: (scripture: Scripture) => void;
  onSaveOffline: (scripture: Scripture) => void;
  onDeleteOffline: (scripture: Scripture) => void;
  onDownloadPdf: (scripture: Scripture) => void;
}

export default function ScriptureListTable({
  scriptures,
  isLoading,
  currentScriptureId,
  offlineScriptureIds,
  onRead,
  onSaveOffline,
  onDeleteOffline,
  onDownloadPdf,
}: ScriptureListTableProps) {
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
          ) : scriptures.length > 0 ? (
            scriptures.map((scripture) => (
              <tr key={scripture.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{scripture.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <button
                    onClick={() => onRead(scripture)}
                    className={`${currentScriptureId === scripture.id ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"} font-medium`}
                  >
                    {currentScriptureId === scripture.id ? "Close" : "Read"}
                  </button>
                  {offlineScriptureIds.has(scripture.id) ? (
                    <button
                      onClick={() => onDeleteOffline(scripture)}
                      className="text-red-600 hover:text-red-900 font-medium inline-block w-32 text-center"
                    >
                      Delete Offline
                    </button>
                  ) : (
                    <button
                      onClick={() => onSaveOffline(scripture)}
                      className="text-blue-600 hover:text-blue-900 font-medium inline-block w-32 text-center"
                    >
                      Save Offline
                    </button>
                  )}
                  <button
                    onClick={() => onDownloadPdf(scripture)}
                    className="text-purple-600 hover:text-purple-900 font-medium"
                  >
                    Download PDF
                  </button>
                </td>
              </tr>
            ))) : (
            <tr>
              <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                No scriptures found matching your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}