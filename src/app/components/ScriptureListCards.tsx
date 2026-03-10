import { Scripture } from "./types";

interface ScriptureListCardsProps {
  scriptures: Scripture[];
  isLoading: boolean;
  currentScriptureId: string | null;
  offlineScriptureIds: Set<string>;
  onRead: (scripture: Scripture) => void;
  onSaveOffline: (scripture: Scripture) => void;
  onDeleteOffline: (scripture: Scripture) => void;
  onDownloadPdf: (scripture: Scripture) => void;
}

export default function ScriptureListCards({
  scriptures,
  isLoading,
  currentScriptureId,
  offlineScriptureIds,
  onRead,
  onSaveOffline,
  onDeleteOffline,
  onDownloadPdf,
}: ScriptureListCardsProps) {
  return (
    <div className="md:hidden space-y-3">
      {isLoading ? (
        <div className="text-center text-gray-500 py-8 border-2 border-dashed rounded-lg">
          Loading library...
        </div>
      ) : scriptures.length > 0 ? (
        scriptures.map((scripture) => (
          <div key={scripture.id} className="bg-white border rounded-lg shadow-sm p-3 space-y-3">
            <h3 className="font-medium text-gray-900 text-base">{scripture.title}</h3>
            <div className="flex gap-2">
              <button
                onClick={() => onRead(scripture)}
                className={`flex-1 py-2 px-4 ${currentScriptureId === scripture.id ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200" : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"} rounded-md font-medium transition-colors text-center text-sm`}
              >
                {currentScriptureId === scripture.id ? "Close" : "Read"}
              </button>
              {offlineScriptureIds.has(scripture.id) ? (
                <button
                  onClick={() => onDeleteOffline(scripture)}
                  className="p-2 bg-red-50 text-red-700 rounded-md font-medium hover:bg-red-100 transition-colors border border-red-200"
                  title="Delete Offline"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => onSaveOffline(scripture)}
                  className="p-2 bg-blue-50 text-blue-700 rounded-md font-medium hover:bg-blue-100 transition-colors border border-blue-200"
                  title="Save Offline"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => onDownloadPdf(scripture)}
                className="p-2 bg-purple-50 text-purple-700 rounded-md font-medium hover:bg-purple-100 transition-colors border border-purple-200"
                title="Download PDF"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 10.5l4.5 4.5m0 0l4.5-4.5m-4.5 4.5v-10.5" />
                </svg>
              </button>
            </div>
          </div>
        ))) : (
        <div className="text-center text-gray-500 py-8 border-2 border-dashed rounded-lg">
          No scriptures found matching your search.
        </div>
      )}
    </div>
  );
}