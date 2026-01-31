import { useState } from "react";
import { useAuthStore } from "../stores/auth-store";
import { isAuthEnabled } from "../client";
import { AuthModal } from "./AuthModal";

interface SignInButtonProps {
  /** Optional class name */
  className?: string;
}

/**
 * Button that shows sign-in modal when clicked.
 * Hidden if user is already signed in or auth is disabled.
 */
export function SignInButton({ className }: SignInButtonProps) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const [showAuth, setShowAuth] = useState(false);

  // Don't render if auth is disabled or user is signed in
  if (!isAuthEnabled() || user) {
    return null;
  }

  // Don't render while loading initial auth state
  if (loading) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowAuth(true)}
        className={
          className ||
          "px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        }
      >
        Sign in
      </button>
      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </>
  );
}
