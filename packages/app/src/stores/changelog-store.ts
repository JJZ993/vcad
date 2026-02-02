/**
 * Changelog store for tracking viewed entries and panel state.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  changelog,
  CURRENT_VERSION,
  type ChangelogEntry,
  type ChangelogCategory,
} from "@vcad/core";

interface ChangelogState {
  // Persisted state
  viewedEntryIds: Set<string>;
  lastSeenVersion: string | null;

  // UI state
  panelOpen: boolean;
  selectedEntryId: string | null;
  filterCategory: ChangelogCategory | "all";

  // Computed getters
  getUnreadCount: () => number;
  getUnreadEntries: () => ChangelogEntry[];
  getFilteredEntries: () => ChangelogEntry[];

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  selectEntry: (id: string | null) => void;
  markEntryViewed: (id: string) => void;
  markAllViewed: () => void;
  setFilter: (category: ChangelogCategory | "all") => void;
}

export const useChangelogStore = create<ChangelogState>()(
  persist(
    (set, get) => ({
      viewedEntryIds: new Set<string>(),
      lastSeenVersion: null,
      panelOpen: false,
      selectedEntryId: null,
      filterCategory: "all",

      getUnreadCount: () => {
        const { viewedEntryIds } = get();
        return changelog.entries.filter((e) => !viewedEntryIds.has(e.id)).length;
      },

      getUnreadEntries: () => {
        const { viewedEntryIds } = get();
        return changelog.entries.filter((e) => !viewedEntryIds.has(e.id));
      },

      getFilteredEntries: () => {
        const { filterCategory } = get();
        if (filterCategory === "all") {
          return changelog.entries;
        }
        return changelog.entries.filter((e) => e.category === filterCategory);
      },

      openPanel: () => set({ panelOpen: true }),

      closePanel: () => set({ panelOpen: false, selectedEntryId: null }),

      togglePanel: () =>
        set((state) => ({
          panelOpen: !state.panelOpen,
          selectedEntryId: state.panelOpen ? null : state.selectedEntryId,
        })),

      selectEntry: (id) => {
        set({ selectedEntryId: id });
        if (id) {
          get().markEntryViewed(id);
        }
      },

      markEntryViewed: (id) =>
        set((state) => ({
          viewedEntryIds: new Set([...state.viewedEntryIds, id]),
        })),

      markAllViewed: () =>
        set({
          viewedEntryIds: new Set(changelog.entries.map((e) => e.id)),
          lastSeenVersion: CURRENT_VERSION,
        }),

      setFilter: (category) => set({ filterCategory: category }),
    }),
    {
      name: "vcad-changelog",
      partialize: (state) => ({
        viewedEntryIds: Array.from(state.viewedEntryIds),
        lastSeenVersion: state.lastSeenVersion,
      }),
      merge: (persisted, current) => {
        const p = persisted as {
          viewedEntryIds?: string[];
          lastSeenVersion?: string | null;
        } | null;
        return {
          ...current,
          viewedEntryIds: new Set(p?.viewedEntryIds ?? []),
          lastSeenVersion: p?.lastSeenVersion ?? null,
        };
      },
    }
  )
);

// Re-export for convenience
export { CURRENT_VERSION };
