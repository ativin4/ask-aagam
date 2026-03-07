
"use client";

import { useState, useEffect } from "react";
import { auth } from "../../../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import Header from "../components/Header";
import MaintainerDashboard from "../components/MaintainerDashboard";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [isMaintainer, setIsMaintainer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const tokenResult = await currentUser.getIdTokenResult(true);
        setIsMaintainer(!!tokenResult.claims.maintainer);
      } else {
        setIsMaintainer(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <main className="p-8 font-sans max-w-5xl mx-auto">
        <div className="animate-pulse">Loading...</div>
      </main>
    );
  }

  return (
    <main className="p-8 font-sans max-w-5xl mx-auto">
      <Header user={user} isMaintainer={isMaintainer} />

      {user ? (
        <>
          <div className="mb-8 p-6 bg-blue-50 border border-blue-100 rounded-lg">
            <h2 className="text-xl font-bold text-blue-900 mb-4">User Profile</h2>
            <div className="space-y-2">
              <p className="text-blue-800">
                <span className="font-semibold">Name:</span> {user.displayName}
              </p>
              <p className="text-blue-800">
                <span className="font-semibold">Email:</span> {user.email}
              </p>
              <p className="text-blue-800">
                <span className="font-semibold">Role:</span> {isMaintainer ? "Maintainer" : "Reader"}
              </p>
            </div>
          </div>

          {isMaintainer && <MaintainerDashboard user={user} />}
        </>
      ) : (
        <div className="p-6 bg-gray-50 border border-gray-200 rounded text-gray-800">
          <h2 className="text-xl font-bold mb-2">Not Signed In</h2>
          <p>Please sign in to view your profile.</p>
        </div>
      )}
    </main>
  );
}