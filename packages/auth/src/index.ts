// Client
export { getSupabase, isAuthEnabled, requireSupabase } from "./client";

// Stores
export { useAuthStore } from "./stores/auth-store";
export { useSyncStore, type SyncStatus } from "./stores/sync-store";

// Hooks
export { useAuth } from "./hooks/useAuth";
export { useRequireAuth, type GatedFeature } from "./hooks/useRequireAuth";

// Components
export { AuthProvider } from "./components/AuthProvider";
export { AuthModal } from "./components/AuthModal";
export { UserMenu } from "./components/UserMenu";
export { FeatureGate } from "./components/FeatureGate";
export { SignInButton } from "./components/SignInButton";
export { VersionHistoryPanel } from "./components/VersionHistoryPanel";

// Sync
export {
  triggerSync,
  debouncedSync,
  enableCloudSync,
  initSyncListeners,
  configureStorage,
  type StorageAdapter,
  type LocalDocument,
  type CloudDocument,
} from "./sync";

// Version history
export {
  getVersionHistory,
  restoreVersion,
  getCloudIdForDocument,
  configureVersionHistoryStorage,
  type DocumentVersion,
} from "./version-history";

// AI
export { textToCAD, isAIAvailable } from "./ai";
