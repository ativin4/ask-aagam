"use client";

import { useState } from "react";
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
  isMaintainer: boolean;
  onEdit: (scripture: Scripture) => void;
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
  isMaintainer,
  onEdit,
}: ScriptureListTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div className="hidden md:block border rounded-lg shadow-sm">
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
                  {isMaintainer && (
                    <div className="relative inline-block text-left">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === scripture.id ? null : scripture.id)}
                        className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 align-middle"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                        </svg>
                      </button>
                      {openMenuId === scripture.id && (
                        <div className="absolute right-0 z-50 mt-2 w-40 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                onEdit(scripture);
                                setOpenMenuId(null);
                              }}
                              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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