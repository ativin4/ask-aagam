"use client";

import { useState, useEffect } from "react";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import Header from "./components/Header";
import BookReader from "./components/BookReader";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isMaintainer, setIsMaintainer] = useState(false);

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
    return () => unsubscribe();
  }, []);

  return (
    <main className="p-8 font-sans max-w-5xl mx-auto">
      <Header user={user} isMaintainer={isMaintainer} />
      <BookReader />
    </main>
  );
}