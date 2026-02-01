import { useEffect, useRef, useCallback } from "react";
import { useDocumentStore } from "@vcad/core";
import { useNotificationStore } from "@/stores/notification-store";
import {
  saveDocument,
  acquireLock,
  releaseLock,
  refreshLock,
  isStorageAvailable,
  isStorageWarning,
} from "@/lib/storage";

const DEBOUNCE_MS = 1000;
const LOCK_REFRESH_MS = 15000;

export function useAutoSave() {
  const documentId = useDocumentStore((s) => s.documentId);
  const documentName = useDocumentStore((s) => s.documentName);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const markSaved = useDocumentStore((s) => s.markSaved);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLockRef = useRef(false);

  const save = useCallback(async () => {
    if (!documentId) return;

    // Check storage availability
    const available = await isStorageAvailable();
    if (!available) {
      useNotificationStore.getState().addToast(
        "Storage full - cannot save",
        "error",
        5000
      );
      return;
    }

    // Check for warning
    const warning = await isStorageWarning();
    if (warning) {
      useNotificationStore.getState().addToast(
        "Storage nearly full (80%+)",
        "info",
        3000
      );
    }

    try {
      const state = useDocumentStore.getState();
      const vcadFile = {
        document: state.document,
        parts: state.parts,
        consumedParts: state.consumedParts,
        nextNodeId: state.nextNodeId,
        nextPartNum: state.nextPartNum,
      };

      await saveDocument(documentId, documentName, vcadFile);
      markSaved();
    } catch (err) {
      console.error("Auto-save failed:", err);
      useNotificationStore.getState().addToast("Auto-save failed", "error");
    }
  }, [documentId, documentName, markSaved]);

  // Acquire lock when document changes
  useEffect(() => {
    if (!documentId) {
      hasLockRef.current = false;
      return;
    }

    let cancelled = false;

    async function tryAcquireLock() {
      const acquired = await acquireLock(documentId!);
      if (cancelled) return;

      if (!acquired) {
        useNotificationStore.getState().addToast(
          "Document is open in another tab",
          "info",
          5000
        );
      }
      hasLockRef.current = acquired;
    }

    tryAcquireLock();

    return () => {
      cancelled = true;
      if (hasLockRef.current && documentId) {
        releaseLock(documentId);
        hasLockRef.current = false;
      }
    };
  }, [documentId]);

  // Periodically refresh lock
  useEffect(() => {
    if (!documentId || !hasLockRef.current) return;

    lockRefreshRef.current = setInterval(async () => {
      if (hasLockRef.current) {
        const refreshed = await refreshLock(documentId);
        if (!refreshed) {
          hasLockRef.current = false;
          useNotificationStore.getState().addToast(
            "Lost document lock - another tab may have taken control",
            "error"
          );
        }
      }
    }, LOCK_REFRESH_MS);

    return () => {
      if (lockRefreshRef.current) {
        clearInterval(lockRefreshRef.current);
        lockRefreshRef.current = null;
      }
    };
  }, [documentId]);

  // Debounced auto-save when dirty
  useEffect(() => {
    if (!isDirty || !documentId || !hasLockRef.current) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      save();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [isDirty, documentId, save]);

  return { save };
}
