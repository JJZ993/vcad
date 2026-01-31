import { useEffect, type ReactNode } from "react";
import { getSupabase, isAuthEnabled } from "../client";
import { useAuthStore } from "../stores/auth-store";

declare const posthog:
  | {
      identify: (id: string, properties?: Record<string, unknown>) => void;
      reset: () => void;
    }
  | undefined;

interface AuthProviderProps {
  children: ReactNode;
  /** Optional callback when user signs in */
  onSignIn?: () => void;
  /** Optional callback when user signs out */
  onSignOut?: () => void;
}

/**
 * Provider component that initializes authentication state.
 * Wrap your app with this component to enable auth features.
 *
 * @example
 * ```tsx
 * <AuthProvider onSignIn={() => triggerSync()}>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({
  children,
  onSignIn,
  onSignOut,
}: AuthProviderProps) {
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);
  const reset = useAuthStore((s) => s.reset);

  useEffect(() => {
    // If auth not configured, mark as initialized and return
    if (!isAuthEnabled()) {
      setLoading(false);
      reset();
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      reset();
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);

      if (session?.user) {
        // Identify user in analytics
        if (typeof posthog !== "undefined") {
          posthog.identify(session.user.id, {
            email: session.user.email,
          });
        }
        onSignIn?.();
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (event === "SIGNED_IN" && session?.user) {
        // Identify user in analytics
        if (typeof posthog !== "undefined") {
          posthog.identify(session.user.id, {
            email: session.user.email,
          });
        }
        onSignIn?.();
      } else if (event === "SIGNED_OUT") {
        // Reset analytics identity
        if (typeof posthog !== "undefined") {
          posthog.reset();
        }
        onSignOut?.();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setSession, setLoading, reset, onSignIn, onSignOut]);

  return <>{children}</>;
}
