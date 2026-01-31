import { useAuthStore } from "../stores/auth-store";

/**
 * Hook to access current auth state.
 * Returns user, session, loading state, and helper methods.
 */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const initialized = useAuthStore((s) => s.initialized);

  return {
    /** Current authenticated user or null */
    user,
    /** Current session with access token */
    session,
    /** True while checking initial session */
    loading,
    /** True after initial session check completes */
    initialized,
    /** True if user is signed in */
    isAuthenticated: !!user,
    /** True if session check is complete and user is not signed in */
    isAnonymous: initialized && !user,
  };
}
