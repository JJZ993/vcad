import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  projectsCreated: number;
  welcomeModalDismissed: boolean;
  incrementProjectsCreated: () => void;
  dismissWelcomeModal: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      projectsCreated: 0,
      welcomeModalDismissed: false,

      incrementProjectsCreated: () =>
        set((state) => ({
          projectsCreated: state.projectsCreated + 1,
        })),

      dismissWelcomeModal: () =>
        set({ welcomeModalDismissed: true }),
    }),
    {
      name: "vcad-onboarding",
    }
  )
);
