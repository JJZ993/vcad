import { create } from "zustand";
import type { Theme, ToolMode, TransformMode } from "@/types";

interface UiState {
  selectedPartIds: Set<string>;
  hoveredPartId: string | null;
  commandPaletteOpen: boolean;
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
  setHoveredPartId: (partId: string | null) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setToolMode: (mode: ToolMode) => void;
  setTransformMode: (mode: TransformMode) => void;
  toggleFeatureTree: () => void;
  toggleTheme: () => void;
  toggleWireframe: () => void;
  toggleGridSnap: () => void;
  setDraggingGizmo: (dragging: boolean) => void;
  copyToClipboard: (partIds: string[]) => void;
}

function getSystemTheme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
}

export const useUiStore = create<UiState>((set) => {
  const initialTheme = getSystemTheme();
  // Apply on init
  queueMicrotask(() => applyTheme(initialTheme));

  // Listen for system theme changes
  if (typeof window !== "undefined" && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      const newTheme = e.matches ? "dark" : "light";
      applyTheme(newTheme);
      set({ theme: newTheme });
    });
  }

  return {
    selectedPartIds: new Set(),
    hoveredPartId: null,
    commandPaletteOpen: false,
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

    setHoveredPartId: (partId) => set({ hoveredPartId: partId }),

    toggleCommandPalette: () =>
      set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

    setToolMode: (mode) => set({ toolMode: mode }),

    setTransformMode: (mode) => set({ transformMode: mode }),

    toggleFeatureTree: () =>
      set((s) => {
        const next = !s.featureTreeOpen;
        localStorage.setItem("vcad-feature-tree", String(next));
        return { featureTreeOpen: next };
      }),

    toggleTheme: () => {
      // Theme follows system - toggle does nothing now
    },

    toggleWireframe: () =>
      set((s) => ({ showWireframe: !s.showWireframe })),

    toggleGridSnap: () =>
      set((s) => ({ gridSnap: !s.gridSnap })),

    setDraggingGizmo: (dragging) => set({ isDraggingGizmo: dragging }),

    copyToClipboard: (partIds) => set({ clipboard: partIds }),
  };
});
