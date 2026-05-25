"use client";

import { useEffect, useState } from 'react';

export default function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    // Capture install prompt before browser shows default one
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // New SW installed but waiting — show update banner
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setUpdateReady(true);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setUpdateReady(true);
          }
        });
      });
    });

    // Reload page after SW takes control (after user confirms update)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleUpdate = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    setUpdateReady(false);
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  return (
    <>
      {updateReady && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          <span>New version available</span>
          <button
            onClick={handleUpdate}
            className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-lg font-medium transition-colors"
          >
            Update
          </button>
        </div>
      )}
      {installPrompt && (
        <div className="fixed bottom-24 right-4 z-40 flex items-center gap-3 bg-white border border-gray-200 text-gray-800 text-sm px-4 py-3 rounded-xl shadow-lg">
          <span>Install Ask Aagam</span>
          <button
            onClick={handleInstall}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg font-medium transition-colors"
          >
            Install
          </button>
          <button
            onClick={() => setInstallPrompt(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
