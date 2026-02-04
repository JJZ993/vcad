import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SignInDelightState {
  /** Whether user has seen the sign-in celebration */
  hasSeenSignInCelebration: boolean;
  /** Whether user has seen the first sync toast */
  hasSeenFirstSync: boolean;

  // Actions
  markSignInCelebrationSeen: () => void;
  markFirstSyncSeen: () => void;
  reset: () => void;
}

export const useSignInDelightStore = create<SignInDelightState>()(
  persist(
    (set) => ({
      hasSeenSignInCelebration: false,
      hasSeenFirstSync: false,

      markSignInCelebrationSeen: () => set({ hasSeenSignInCelebration: true }),
      markFirstSyncSeen: () => set({ hasSeenFirstSync: true }),
      reset: () =>
        set({
          hasSeenSignInCelebration: false,
          hasSeenFirstSync: false,
        }),
    }),
    {
      name: "vcad:sign-in-delight",
    }
  )
);
