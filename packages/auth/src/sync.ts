import { requireSupabase, isAuthEnabled } from "./client";
import { useAuthStore } from "./stores/auth-store";
import { useSyncStore } from "./stores/sync-store";

/**
 * Cloud document shape as stored in Supabase
 */
export interface CloudDocument {
  id: string;
  local_id: string;
  name: string;
  content: unknown;
  version: number;
  device_modified_at: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Interface for local document storage.
 * This should be implemented by the app's storage module.
 */
export interface StorageAdapter {
  getAllDocuments: () => Promise<LocalDocument[]>;
  getDocument: (id: string) => Promise<LocalDocument | null>;
  saveDocument: (doc: LocalDocument) => Promise<void>;
  updateDocument: (
    id: string,
    updates: Partial<LocalDocument>
  ) => Promise<void>;
}

export interface LocalDocument {
  id: string;
  name: string;
  document: unknown;
  createdAt: number;
  modifiedAt: number;
  version: number;
  syncStatus: "local" | "synced" | "pending";
  cloudId?: string;
  thumbnail?: Blob;
}

// Storage adapter - set by the app
let storageAdapter: StorageAdapter | null = null;

/**
 * Configure the storage adapter for sync operations.
 * Call this during app initialization.
 */
export function configureStorage(adapter: StorageAdapter): void {
  storageAdapter = adapter;
}

function requireStorage(): StorageAdapter {
  if (!storageAdapter) {
    throw new Error("Storage adapter not configured. Call configureStorage()");
  }
  return storageAdapter;
}

// Debounce timer for sync
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Trigger a sync operation.
 * Uploads pending local documents and downloads new cloud documents.
 *
 * Safe to call frequently - operations are debounced internally.
 */
export async function triggerSync(): Promise<void> {
  const { user } = useAuthStore.getState();
  if (!isAuthEnabled() || !user) {
    return;
  }

  const { setSyncStatus, setLastSyncAt, setError, setPendingCount } =
    useSyncStore.getState();

  setSyncStatus("syncing");
  setError(null);

  try {
    // 1. Upload pending local documents
    await uploadPendingDocuments();

    // 2. Download new/updated cloud documents
    await downloadCloudDocuments();

    // Update pending count
    const storage = requireStorage();
    const docs = await storage.getAllDocuments();
    const pending = docs.filter((d) => d.syncStatus === "pending").length;
    setPendingCount(pending);

    setSyncStatus("synced");
    setLastSyncAt(Date.now());
  } catch (error) {
    console.error("Sync failed:", error);
    setSyncStatus("error");
    setError((error as Error).message);
  }
}

/**
 * Debounced sync trigger - waits 5 seconds after last call before syncing.
 * Use this for auto-sync on document changes.
 */
export function debouncedSync(delay = 5000): void {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    triggerSync();
  }, delay);
}

/**
 * Upload documents where syncStatus='pending'
 */
async function uploadPendingDocuments(): Promise<void> {
  const storage = requireStorage();
  const localDocs = await storage.getAllDocuments();
  const pendingDocs = localDocs.filter((d) => d.syncStatus === "pending");

  for (const doc of pendingDocs) {
    await uploadDocument(doc);
  }
}

/**
 * Upload a single document to cloud
 */
async function uploadDocument(doc: LocalDocument): Promise<void> {
  const supabase = requireSupabase();
  const storage = requireStorage();

  // Check if document already exists in cloud
  const { data: existing } = await supabase
    .from("documents")
    .select("id, version, device_modified_at")
    .eq("local_id", doc.id)
    .maybeSingle();

  if (existing) {
    // Document exists in cloud - check for conflict
    if (existing.device_modified_at > doc.modifiedAt) {
      // Cloud is newer - conflict! For now, last-write-wins (cloud)
      // TODO: Prompt user or implement merge strategy
      console.warn(
        `Conflict on ${doc.id}: cloud is newer, keeping cloud version`
      );
      return;
    }

    // Local is newer - update cloud
    const { error } = await supabase
      .from("documents")
      .update({
        name: doc.name,
        content: doc.document,
        version: doc.version,
        device_modified_at: doc.modifiedAt,
      })
      .eq("id", existing.id);

    if (error) throw error;
  } else {
    // New document - insert
    const { data, error } = await supabase
      .from("documents")
      .insert({
        local_id: doc.id,
        name: doc.name,
        content: doc.document,
        version: doc.version,
        device_modified_at: doc.modifiedAt,
      })
      .select("id")
      .single();

    if (error) throw error;

    // Store cloud ID in local doc
    if (data) {
      await storage.updateDocument(doc.id, {
        cloudId: data.id,
      });
    }
  }

  // Mark as synced
  await storage.updateDocument(doc.id, { syncStatus: "synced" });
}

/**
 * Download documents from cloud, merge into local
 */
async function downloadCloudDocuments(): Promise<void> {
  const supabase = requireSupabase();
  const storage = requireStorage();

  const { data: cloudDocs, error } = await supabase
    .from("documents")
    .select("*");

  if (error) throw error;
  if (!cloudDocs) return;

  const localDocs = await storage.getAllDocuments();
  const localByLocalId = new Map(localDocs.map((d) => [d.id, d]));

  for (const cloudDoc of cloudDocs as CloudDocument[]) {
    const localDoc = localByLocalId.get(cloudDoc.local_id);

    if (!localDoc) {
      // New document from cloud - create locally
      await createDocumentFromCloud(cloudDoc);
    } else if (cloudDoc.device_modified_at > localDoc.modifiedAt) {
      // Cloud is newer - update local
      await updateDocumentFromCloud(localDoc.id, cloudDoc);
    }
    // If local is newer, uploadPendingDocuments handles it
  }
}

/**
 * Create a new local document from cloud data
 */
async function createDocumentFromCloud(cloudDoc: CloudDocument): Promise<void> {
  const storage = requireStorage();

  const newDoc: LocalDocument = {
    id: cloudDoc.local_id,
    name: cloudDoc.name,
    document: cloudDoc.content,
    createdAt: new Date(cloudDoc.created_at).getTime(),
    modifiedAt: cloudDoc.device_modified_at,
    version: cloudDoc.version,
    syncStatus: "synced",
    cloudId: cloudDoc.id,
  };

  await storage.saveDocument(newDoc);
}

/**
 * Update local document from cloud data
 */
async function updateDocumentFromCloud(
  localId: string,
  cloudDoc: CloudDocument
): Promise<void> {
  const storage = requireStorage();

  await storage.updateDocument(localId, {
    name: cloudDoc.name,
    document: cloudDoc.content,
    modifiedAt: cloudDoc.device_modified_at,
    version: cloudDoc.version,
    syncStatus: "synced",
    cloudId: cloudDoc.id,
  });
}

/**
 * Enable cloud sync for a local-only document.
 * Marks the document as pending and triggers sync.
 */
export async function enableCloudSync(documentId: string): Promise<void> {
  const storage = requireStorage();
  await storage.updateDocument(documentId, { syncStatus: "pending" });
  await triggerSync();
}

/**
 * Initialize sync listeners for automatic sync.
 * Call this during app initialization.
 */
export function initSyncListeners(): void {
  // Sync when window gains focus
  window.addEventListener("focus", () => {
    const { user } = useAuthStore.getState();
    if (user) {
      triggerSync();
    }
  });

  // Sync when network comes back online
  window.addEventListener("online", () => {
    const { user } = useAuthStore.getState();
    if (user) {
      triggerSync();
    }
  });

  // Sync when visibility changes (e.g., switching tabs back)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const { user } = useAuthStore.getState();
      if (user) {
        // Use debounced sync to avoid rapid-fire syncs
        debouncedSync(1000);
      }
    }
  });
}
