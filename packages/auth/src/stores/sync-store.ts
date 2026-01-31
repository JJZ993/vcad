import { create } from "zustand";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

interface SyncState {
  /** Current sync status */
  syncStatus: SyncStatus;
  /** Unix timestamp of last successful sync */
  lastSyncAt: number | null;
  /** Number of documents pending upload */
  pendingCount: number;
  /** Last sync error message */
  error: string | null;

  // Actions
  setSyncStatus: (status: SyncStatus) => void;
  setLastSyncAt: (time: number) => void;
  setPendingCount: (count: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  syncStatus: "idle",
  lastSyncAt: null,
  pendingCount: 0,
  error: null,

  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      syncStatus: "idle",
      lastSyncAt: null,
      pendingCount: 0,
      error: null,
    }),
}));
