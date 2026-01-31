import { useEffect, useState } from "react";
import {
  getVersionHistory,
  restoreVersion,
  type DocumentVersion,
} from "../version-history";

interface VersionHistoryPanelProps {
  /** Local document ID */
  localDocId: string;
  /** Cloud document ID (from syncStatus) */
  cloudDocId: string | null;
  /** Callback after restoring a version */
  onRestore?: () => void;
}

/**
 * Panel showing version history for a cloud-synced document.
 * Allows restoring to previous versions.
 */
export function VersionHistoryPanel({
  localDocId,
  cloudDocId,
  onRestore,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudDocId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getVersionHistory(cloudDocId)
      .then((v) => {
        setVersions(v);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [cloudDocId]);

  const handleRestore = async (version: DocumentVersion) => {
    setRestoring(version.id);
    try {
      await restoreVersion(localDocId, version);
      onRestore?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoring(null);
    }
  };

  const formatRelativeTime = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

    return new Date(timestamp).toLocaleDateString();
  };

  // Not synced to cloud
  if (!cloudDocId) {
    return (
      <div className="p-4">
        <h3 className="font-semibold mb-3 text-zinc-900 dark:text-zinc-100">
          Version History
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enable cloud sync to access version history.
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
          Your document changes will be automatically versioned when synced to
          the cloud.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="font-semibold mb-3 text-zinc-900 dark:text-zinc-100">
        Version History
      </h3>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="animate-spin">&#8987;</span>
          Loading versions...
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 mb-3">
          {error}
        </div>
      )}

      {!loading && versions.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No previous versions yet. Versions are created automatically when you
          save changes.
        </p>
      )}

      {versions.length > 0 && (
        <div className="space-y-1">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between py-2 px-2 -mx-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Version {v.versionNumber}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatRelativeTime(v.deviceModifiedAt)}
                </div>
              </div>
              <button
                onClick={() => handleRestore(v)}
                disabled={restoring === v.id}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
              >
                {restoring === v.id ? "Restoring..." : "Restore"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
