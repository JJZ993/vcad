import { useState, useCallback } from "react";
import { useAuthStore } from "../stores/auth-store";
import { isAuthEnabled } from "../client";

export type GatedFeature =
  | "cloud-sync"
  | "ai"
  | "quotes"
  | "step-export"
  | "version-history";

/**
 * Hook for gating features behind authentication.
 *
 * @param feature - The feature being gated (used for analytics and auth modal message)
 * @returns Object with auth state and a requireAuth wrapper function
 *
 * @example
 * ```tsx
 * function QuoteButton() {
 *   const { requireAuth, showAuth, setShowAuth, feature } = useRequireAuth("quotes");
 *
 *   const handleClick = () => {
 *     requireAuth(() => {
 *       // This only runs if user is authenticated
 *       requestQuote();
 *     });
 *   };
 *
 *   return (
 *     <>
 *       <button onClick={handleClick}>Request Quote</button>
 *       <AuthModal open={showAuth} onOpenChange={setShowAuth} feature={feature} />
 *     </>
 *   );
 * }
 * ```
 */
export function useRequireAuth(feature: GatedFeature) {
  const user = useAuthStore((s) => s.user);
  const [showAuth, setShowAuth] = useState(false);

  const requireAuth = useCallback(
    (callback: () => void) => {
      // If auth not configured (self-hosted), allow all features
      if (!isAuthEnabled()) {
        callback();
        return;
      }

      // If user is signed in, run the callback
      if (user) {
        callback();
        return;
      }

      // Otherwise, show auth modal
      setShowAuth(true);
    },
    [user]
  );

  return {
    /** Whether user is currently authenticated (or auth is disabled) */
    isAuthenticated: !isAuthEnabled() || !!user,
    /** Wrapper that shows auth modal if not authenticated, otherwise runs callback */
    requireAuth,
    /** Whether to show the auth modal */
    showAuth,
    /** Setter for showAuth state */
    setShowAuth,
    /** The feature being gated (for auth modal message) */
    feature,
  };
}
