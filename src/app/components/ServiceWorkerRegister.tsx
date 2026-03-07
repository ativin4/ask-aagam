// app/components/ServiceWorkerRegister.tsx
"use client"; // This directive tells Next.js this runs in the browser

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Check if the browser supports service workers
    if ('serviceWorker' in navigator) {
      // Wait for the page to fully load before registering to avoid blocking the main thread
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js')
         .then(function (registration) {
            console.log('Service Worker registration successful with scope: ', registration.scope);
          }, function (err) {
            console.log('Service Worker registration failed: ', err);
          });
      });
    }
  },);

  // This component doesn't render any visible UI
  return null; 
}