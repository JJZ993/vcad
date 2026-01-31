import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  /** Current authenticated user, or null if not signed in */
  user: User | null;
  /** Current session with access token */
  session: Session | null;
  /** True while checking initial session state */
  loading: boolean;
  /** True if initial session check is complete */
  initialized: boolean;

  // Actions
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      loading: false,
      initialized: true,
    }),

  setLoading: (loading) => set({ loading }),

  reset: () =>
    set({
      user: null,
      session: null,
      loading: false,
      initialized: true,
    }),
}));
