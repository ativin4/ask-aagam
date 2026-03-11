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
    <div className="flex justify-between items-center mb-8 border-b pb-4">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-3xl font-bold hover:opacity-80 transition">
          Aagam Library
        </Link>
      </div>
      
      {!isLoading && (!user ? (
        <button onClick={handleLogin} className="bg-blue-600 text-white px-4 py-2 rounded">
          Sign in with Google
        </button>
      ) : (
        <div className="flex items-center gap-4">
          <Link href="/profile" className="text-sm font-medium hover:text-blue-600 transition">
            {user.displayName} {isMaintainer ? "(Maintainer)" : "(Reader)"}
          </Link>
          <button onClick={() => signOut(auth)} className="bg-red-500 text-white px-4 py-2 rounded">
            Sign out
          </button>
        </div>
      ))}
    </div>
  );
}
