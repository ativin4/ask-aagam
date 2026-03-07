"use client";

import { useState, useEffect } from "react";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import Header from "./components/Header";
import BookReader from "./components/BookReader";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isMaintainer, setIsMaintainer] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const tokenResult = await currentUser.getIdTokenResult(true);
        setIsMaintainer(!!tokenResult.claims.maintainer);
      } else {
        setIsMaintainer(false);
      }
    });

    // Check if running on iOS and not in standalone mode
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !isStandalone) {
      setShowIosHint(true);
    }

    return () => unsubscribe();
  }, []);

  return (
    <main className="p-8 font-sans max-w-5xl mx-auto">
      {showIosHint && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-6 text-sm">
          <p className="font-semibold mb-1">Install App on iOS</p>
          <p>Tap the Share button <span className="text-lg leading-none">⎋</span> and select <strong>Add to Home Screen</strong> for the best reading experience.</p>
        </div>
      )}
      <Header user={user} isMaintainer={isMaintainer} />
      <BookReader />
    </main>
  );
}