import { Scripture } from "./types";

interface CompactScriptureListProps {
  scriptures: Scripture[];
  currentScriptureId: string | null;
  offlineScriptureIds: Set<string>;
  onRead: (scripture: Scripture) => void;
}

export default function CompactScriptureList({
  scriptures,
  currentScriptureId,
  offlineScriptureIds,
  onRead,
}: CompactScriptureListProps) {
  return (
    <div className="space-y-1 p-1">
      {scriptures.map((scripture) => (
        <button
          key={scripture.id}
          onClick={() => onRead(scripture)}
          className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex justify-between items-center ${
            currentScriptureId === scripture.id
              ? "bg-blue-100 text-blue-900 border-blue-200 border"
              : "hover:bg-gray-100 text-gray-700 border border-transparent"
          }`}
        >
          <span className="truncate mr-2">{scripture.title}</span>
          {offlineScriptureIds.has(scripture.id) && (
            <span className="flex-none text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">
              Offline
            </span>
          )}
        </button>
      ))}
      {scriptures.length === 0 && (
        <div className="text-center text-gray-500 py-4 text-sm">
          No scriptures found.
        </div>
      )}
    </div>
  );
}