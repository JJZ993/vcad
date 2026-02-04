import { useEffect, type ReactNode } from "react";
import { getSupabase, isAuthEnabled } from "../client";
import { useAuthStore } from "../stores/auth-store";
import { useSignInDelightStore } from "../stores/sign-in-delight-store";

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
  /** Optional callback for first-time sign-in celebration */
  onFirstSignIn?: (firstName: string) => void;
}

/**
 * Check if this is a new user (created within the last hour).
 * Prevents confetti for existing users signing in on new devices.
 */
function isNewUser(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return created > oneHourAgo;
}

/**
 * Extract first name from user metadata or email.
 */
function getFirstName(user: { user_metadata?: { full_name?: string; name?: string }; email?: string }): string {
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name;
  if (fullName) {
    return fullName.split(" ")[0] || "there";
  }
  // Fallback to email prefix
  if (user.email) {
    return user.email.split("@")[0] || "there";
  }
  return "there";
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
  onFirstSignIn,
}: AuthProviderProps) {
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);
  const reset = useAuthStore((s) => s.reset);
  const hasSeenCelebration = useSignInDelightStore((s) => s.hasSeenSignInCelebration);
  const markCelebrationSeen = useSignInDelightStore((s) => s.markSignInCelebrationSeen);

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
            auth_provider: session.user.app_metadata?.provider,
            created_at: session.user.created_at,
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
            auth_provider: session.user.app_metadata?.provider,
            created_at: session.user.created_at,
          });
        }

        // Check if this is a first-time sign-in celebration
        if (!hasSeenCelebration && isNewUser(session.user.created_at)) {
          markCelebrationSeen();
          const firstName = getFirstName(session.user);
          // Dispatch celebration event for CelebrationOverlay
          window.dispatchEvent(new CustomEvent("vcad:celebrate-sign-in"));
          // Dispatch welcome event with user's name for toast
          window.dispatchEvent(
            new CustomEvent("vcad:welcome-sign-in", { detail: { firstName } })
          );
          onFirstSignIn?.(firstName);
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
  }, [setSession, setLoading, reset, onSignIn, onSignOut, onFirstSignIn, hasSeenCelebration, markCelebrationSeen]);

  return <>{children}</>;
}
