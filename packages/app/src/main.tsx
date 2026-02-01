import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import posthog from "posthog-js";

// Unregister service workers in dev mode to prevent stale cache issues
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      console.log("[dev] Unregistered stale service worker");
    }
  });
}
import {
  AuthProvider,
  configureStorage,
  configureVersionHistoryStorage,
  initSyncListeners,
  triggerSync,
  type StorageAdapter,
} from "@vcad/auth";
import { App } from "./App";
import "./index.css";
import {
  getAllDocuments,
  loadDocument,
  saveCompleteDocument,
  updateDocument,
} from "./lib/storage";

// Initialize PostHog
const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
  });
}

// Configure storage adapter for auth/sync
const storageAdapter: StorageAdapter = {
  getAllDocuments: async () => {
    const docs = await getAllDocuments();
    return docs.map((d) => ({
      id: d.id,
      name: d.name,
      document: d.document,
      createdAt: d.createdAt,
      modifiedAt: d.modifiedAt,
      version: d.version,
      syncStatus: d.syncStatus,
      cloudId: d.cloudId,
      thumbnail: d.thumbnail,
    }));
  },
  getDocument: async (id) => {
    const doc = await loadDocument(id);
    if (!doc) return null;
    return {
      id: doc.id,
      name: doc.name,
      document: doc.document,
      createdAt: doc.createdAt,
      modifiedAt: doc.modifiedAt,
      version: doc.version,
      syncStatus: doc.syncStatus,
      cloudId: doc.cloudId,
      thumbnail: doc.thumbnail,
    };
  },
  saveDocument: async (doc) => {
    await saveCompleteDocument({
      id: doc.id,
      name: doc.name,
      document: doc.document as import("@vcad/core").VcadFile,
      createdAt: doc.createdAt,
      modifiedAt: doc.modifiedAt,
      version: doc.version,
      syncStatus: doc.syncStatus,
      cloudId: doc.cloudId,
      thumbnail: doc.thumbnail,
    });
  },
  updateDocument: async (id, updates) => {
    await updateDocument(id, updates as Parameters<typeof updateDocument>[1]);
  },
};

configureStorage(storageAdapter);
configureVersionHistoryStorage(storageAdapter);
initSyncListeners();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider onSignIn={() => triggerSync()}>
      <App />
    </AuthProvider>
  </StrictMode>,
);
