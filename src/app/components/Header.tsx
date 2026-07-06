import Link from "next/link";
import { User, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../../../lib/firebase";

interface HeaderProps {
  user: User | null;
  isMaintainer: boolean;
  isLoading?: boolean;
}

export default function Header({ user, isMaintainer, isLoading }: HeaderProps) {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <div className="flex justify-between items-center mb-3 sm:mb-8 border-b pb-2 sm:pb-4">
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/" className="text-xl sm:text-3xl font-bold hover:opacity-80 transition">
          Aagam Library
        </Link>
        <Link href="/bhajans" className="text-sm sm:text-base text-gray-600 hover:text-gray-900 transition">
          Bhajans
        </Link>
      </div>

      {!isLoading && (!user ? (
        <button onClick={handleLogin} className="bg-blue-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded text-sm sm:text-base">
          Sign in with Google
        </button>
      ) : (
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden sm:inline text-sm font-medium text-gray-700">
            {user.displayName} {isMaintainer ? "(Maintainer)" : ""}
          </span>
          <button onClick={() => signOut(auth)} className="bg-red-500 text-white px-2 py-1 sm:px-4 sm:py-2 rounded text-xs sm:text-base">
            Sign out
          </button>
        </div>
      ))}
    </div>
  );
}
