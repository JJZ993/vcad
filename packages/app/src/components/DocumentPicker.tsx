import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  File,
  Plus,
  Trash,
  Pencil,
  CloudSlash,
  Cloud,
  HardDrives,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useEffect, useState, useCallback } from "react";
import { useDocumentStore } from "@vcad/core";
import { useNotificationStore } from "@/stores/notification-store";
import {
  listDocuments,
  loadDocument,
  deleteDocument as deleteDocumentFromDb,
  renameDocument as renameDocumentInDb,
  generateDocumentName,
  getStorageUsage,
  isDocumentLocked,
  type DocumentMeta,
} from "@/lib/storage";

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Within last hour
  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / 60000);
    return mins <= 1 ? "Just now" : `${mins}m ago`;
  }

  // Within last day
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }

  // Within last week
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }

  // Otherwise show date
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface DocumentRowProps {
  doc: DocumentMeta;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

function DocumentRow({
  doc,
  isSelected,
  isLocked,
  onSelect,
  onOpen,
  onDelete,
  onRename,
}: DocumentRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(doc.name);

  const handleDoubleClick = useCallback(() => {
    if (!isLocked) {
      onOpen();
    }
  }, [isLocked, onOpen]);

  const handleRename = useCallback(() => {
    if (editName.trim() && editName !== doc.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  }, [editName, doc.name, onRename]);

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2 cursor-pointer border border-transparent",
        "hover:bg-surface/50",
        isSelected && "bg-accent/10 border-accent/30"
      )}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
    >
      <File size={16} weight="regular" className="text-text-muted shrink-0" />

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="w-full bg-transparent border-b border-accent text-sm text-text outline-none"
            autoFocus
          />
        ) : (
          <div className="text-sm text-text truncate">{doc.name}</div>
        )}
        <div className="text-[10px] text-text-muted">
          {formatDate(doc.modifiedAt)}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isLocked ? (
          <span className="text-[10px] text-text-muted px-2">In use</span>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditName(doc.name);
                setIsEditing(true);
              }}
              className="p-1 text-text-muted hover:text-text hover:bg-border/50 transition-colors"
              title="Rename"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-text-muted hover:text-danger hover:bg-border/50 transition-colors"
              title="Delete"
            >
              <Trash size={14} />
            </button>
          </>
        )}
      </div>

      <div className="text-text-muted shrink-0" title={
        doc.syncStatus === "synced" ? "Synced" :
        doc.syncStatus === "pending" ? "Pending sync" : "Local only"
      }>
        {doc.syncStatus === "synced" ? (
          <Cloud size={14} className="text-accent" />
        ) : doc.syncStatus === "pending" ? (
          <Cloud size={14} className="text-warning" />
        ) : (
          <CloudSlash size={14} />
        )}
      </div>
    </div>
  );
}

export function DocumentPicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [storageUsage, setStorageUsage] = useState({ used: 0, quota: 0, percentage: 0 });
  const [loading, setLoading] = useState(true);

  const currentDocId = useDocumentStore((s) => s.documentId);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await listDocuments();
      setDocuments(docs);

      // Check which docs are locked
      const locked = new Set<string>();
      for (const doc of docs) {
        if (await isDocumentLocked(doc.id)) {
          locked.add(doc.id);
        }
      }
      setLockedIds(locked);

      // Get storage usage
      const usage = await getStorageUsage();
      setStorageUsage(usage);
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDocuments();
    }
  }, [open, loadDocuments]);

  const handleNewDocument = useCallback(async () => {
    const name = await generateDocumentName();
    const id = crypto.randomUUID();
    useDocumentStore.getState().newDocument(id, name);
    onOpenChange(false);
    useNotificationStore.getState().addToast(`Created "${name}"`, "success");
  }, [onOpenChange]);

  const handleOpenDocument = useCallback(async () => {
    if (!selectedId) return;

    const isLocked = await isDocumentLocked(selectedId);
    if (isLocked) {
      useNotificationStore.getState().addToast(
        "Document is open in another tab",
        "error"
      );
      return;
    }

    try {
      const stored = await loadDocument(selectedId);
      if (!stored) {
        useNotificationStore.getState().addToast("Document not found", "error");
        return;
      }

      useDocumentStore.getState().loadDocument(stored.document);
      useDocumentStore.getState().setDocumentMeta(stored.id, stored.name);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to open document:", err);
      useNotificationStore.getState().addToast("Failed to open document", "error");
    }
  }, [selectedId, onOpenChange]);

  const handleDeleteDocument = useCallback(async (id: string) => {
    if (id === currentDocId) {
      useNotificationStore.getState().addToast(
        "Cannot delete the current document",
        "error"
      );
      return;
    }

    try {
      await deleteDocumentFromDb(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
      }
      useNotificationStore.getState().addToast("Document deleted", "success");
    } catch (err) {
      console.error("Failed to delete document:", err);
      useNotificationStore.getState().addToast("Failed to delete document", "error");
    }
  }, [selectedId, currentDocId]);

  const handleRenameDocument = useCallback(async (id: string, name: string) => {
    try {
      await renameDocumentInDb(id, name);
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, name } : d))
      );

      // If this is the current doc, update the store too
      if (id === currentDocId) {
        useDocumentStore.getState().setDocumentMeta(id, name);
      }
    } catch (err) {
      console.error("Failed to rename document:", err);
      useNotificationStore.getState().addToast("Failed to rename document", "error");
    }
  }, [currentDocId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "border border-border bg-card shadow-2xl",
            "max-h-[85vh] flex flex-col",
            "focus:outline-none"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Dialog.Title className="text-sm font-bold text-text">
              Documents
            </Dialog.Title>
            <Dialog.Close className="p-1 text-text-muted hover:bg-border/50 hover:text-text transition-colors cursor-pointer">
              <X size={16} />
            </Dialog.Close>
          </div>

          {/* Actions */}
          <div className="p-3 border-b border-border">
            <button
              onClick={handleNewDocument}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text hover:bg-surface/50 transition-colors"
            >
              <Plus size={16} className="text-accent" />
              New Document
            </button>
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Loading...
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
                <File size={32} weight="thin" />
                <div className="text-sm">No saved documents</div>
                <div className="text-[10px]">Create a new document to get started</div>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    isSelected={selectedId === doc.id}
                    isLocked={lockedIds.has(doc.id)}
                    onSelect={() => setSelectedId(doc.id)}
                    onOpen={handleOpenDocument}
                    onDelete={() => handleDeleteDocument(doc.id)}
                    onRename={(name) => handleRenameDocument(doc.id, name)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-3 border-t border-border bg-surface/30">
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <HardDrives size={14} />
              <span>
                {formatBytes(storageUsage.used)} / {formatBytes(storageUsage.quota)}
              </span>
              {storageUsage.percentage >= 80 && (
                <span className="text-warning">({storageUsage.percentage.toFixed(0)}%)</span>
              )}
            </div>
            <button
              onClick={handleOpenDocument}
              disabled={!selectedId || lockedIds.has(selectedId)}
              className={cn(
                "px-4 py-1.5 text-xs font-medium transition-colors",
                selectedId && !lockedIds.has(selectedId)
                  ? "bg-accent text-white hover:bg-accent/90"
                  : "bg-border text-text-muted cursor-not-allowed"
              )}
            >
              Open
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
