"use client";

import { type ReactNode, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../../../lib/firebase";
import Header from "./Header";
import ScriptureReader from "./ScriptureReader";
import ChatBot from "./ChatBot";

interface HomeAppProps {
  children: ReactNode;
}

export default function HomeApp({ children }: HomeAppProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isMaintainer, setIsMaintainer] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const tokenResult = await currentUser.getIdTokenResult(true);
        setIsMaintainer(!!tokenResult.claims.maintainer);
      } else {
        setIsMaintainer(false);
      }
      setAuthLoading(false);
    });

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream: unknown }).MSStream;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isIos && !isStandalone) {
      setTimeout(() => setShowIosHint(true), 0);
    }

    return () => unsubscribe();
  }, []);

  return (
    <main className="p-3 sm:p-8 font-sans max-w-5xl mx-auto">
      {showIosHint && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-6 text-sm">
          <p className="font-semibold mb-1">Install App on iOS</p>
          <p>Tap the Share button <span className="text-lg leading-none">⎋</span> and select <strong>Add to Home Screen</strong> for the best reading experience.</p>
        </div>
      )}
      <Header user={user} isMaintainer={isMaintainer} isLoading={authLoading} />
      {children}
      <ScriptureReader isMaintainer={isMaintainer} />
      <ChatBot />
    </main>
  );
}
