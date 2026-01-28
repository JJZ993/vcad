import { create } from "zustand";
import type { Theme, ToolMode, TransformMode } from "@/types";

interface UiState {
  selectedPartIds: Set<string>;
  toolMode: ToolMode;
  transformMode: TransformMode;
  featureTreeOpen: boolean;
  theme: Theme;
  isDraggingGizmo: boolean;
  showWireframe: boolean;
  gridSnap: boolean;
  snapIncrement: number;
  clipboard: string[];

  select: (partId: string | null) => void;
  toggleSelect: (partId: string) => void;
  selectMultiple: (partIds: string[]) => void;
  clearSelection: () => void;
  setToolMode: (mode: ToolMode) => void;
  setTransformMode: (mode: TransformMode) => void;
  toggleFeatureTree: () => void;
  toggleTheme: () => void;
  toggleWireframe: () => void;
  toggleGridSnap: () => void;
  setDraggingGizmo: (dragging: boolean) => void;
  copyToClipboard: (partIds: string[]) => void;
}

function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem("vcad-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore
  }
  return "dark";
}

function loadFeatureTree(): boolean {
  try {
    const stored = localStorage.getItem("vcad-feature-tree");
    if (stored !== null) return stored === "true";
  } catch {
    // ignore
  }
  return true;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  localStorage.setItem("vcad-theme", theme);
}

export const useUiStore = create<UiState>((set) => {
  const initialTheme = loadTheme();
  // Apply on init
  queueMicrotask(() => applyTheme(initialTheme));

  return {
    selectedPartIds: new Set(),
    toolMode: "select",
    transformMode: "translate",
    featureTreeOpen: loadFeatureTree(),
    theme: initialTheme,
    isDraggingGizmo: false,
    showWireframe: false,
    gridSnap: false,
    snapIncrement: 5,
    clipboard: [],

    select: (partId) =>
      set({ selectedPartIds: partId ? new Set([partId]) : new Set() }),

    toggleSelect: (partId) =>
      set((s) => {
        const next = new Set(s.selectedPartIds);
        if (next.has(partId)) {
          next.delete(partId);
        } else {
          next.add(partId);
        }
        return { selectedPartIds: next };
      }),

    selectMultiple: (partIds) =>
      set({ selectedPartIds: new Set(partIds) }),

    clearSelection: () => set({ selectedPartIds: new Set() }),

    setToolMode: (mode) => set({ toolMode: mode }),

    setTransformMode: (mode) => set({ transformMode: mode }),

    toggleFeatureTree: () =>
      set((s) => {
        const next = !s.featureTreeOpen;
        localStorage.setItem("vcad-feature-tree", String(next));
        return { featureTreeOpen: next };
      }),

    toggleTheme: () =>
      set((s) => {
        const next = s.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        return { theme: next };
      }),

    toggleWireframe: () =>
      set((s) => ({ showWireframe: !s.showWireframe })),

    toggleGridSnap: () =>
      set((s) => ({ gridSnap: !s.gridSnap })),

    setDraggingGizmo: (dragging) => set({ isDraggingGizmo: dragging }),

    copyToClipboard: (partIds) => set({ clipboard: partIds }),
  };
});
