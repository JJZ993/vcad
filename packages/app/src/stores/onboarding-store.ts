import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  examplesOpened: string[];
  projectsCreated: number;
  welcomeModalDismissed: boolean;
  markExampleOpened: (id: string) => void;
  incrementProjectsCreated: () => void;
  dismissWelcomeModal: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      examplesOpened: [],
      projectsCreated: 0,
      welcomeModalDismissed: false,

      markExampleOpened: (id) =>
        set((state) => ({
          examplesOpened: state.examplesOpened.includes(id)
            ? state.examplesOpened
            : [...state.examplesOpened, id],
        })),

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
