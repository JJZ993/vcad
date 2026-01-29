import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Cube,
  Cylinder,
  Globe,
  ArrowsOutCardinal,
  ArrowClockwise,
  ArrowsOut,
  ArrowCounterClockwise,
  Unite,
  Subtract,
  Intersect,
  FloppyDisk,
  FolderOpen,
  Export,
  GridFour,
  CubeTransparent,
  SidebarSimple,
  Sun,
  Info,
  Trash,
  Copy,
  X,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type { Command } from "@/lib/commands";
import { createCommandRegistry } from "@/lib/commands";
import { useUiStore } from "@/stores/ui-store";
import { useDocumentStore } from "@/stores/document-store";
import { useEngineStore } from "@/stores/engine-store";
import { exportStl } from "@/lib/export-stl";
import { exportGltf } from "@/lib/export-gltf";
import { downloadBlob } from "@/lib/download";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Cube> = {
  Cube,
  Cylinder,
  Globe,
  ArrowsOutCardinal,
  ArrowClockwise,
  ArrowsOut,
  ArrowCounterClockwise,
  Unite,
  Subtract,
  Intersect,
  FloppyDisk,
  FolderOpen,
  Export,
  GridFour,
  CubeTransparent,
  SidebarSimple,
  Sun,
  Info,
  Trash,
  Copy,
  X,
};

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-accent font-medium">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAboutOpen: () => void;
}

export function CommandPalette({ open, onOpenChange, onAboutOpen }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get store actions
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const applyBoolean = useDocumentStore((s) => s.applyBoolean);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const removePart = useDocumentStore((s) => s.removePart);
  const duplicateParts = useDocumentStore((s) => s.duplicateParts);
  const undoStack = useDocumentStore((s) => s.undoStack);
  const redoStack = useDocumentStore((s) => s.redoStack);
  const parts = useDocumentStore((s) => s.parts);

  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const select = useUiStore((s) => s.select);
  const selectMultiple = useUiStore((s) => s.selectMultiple);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const toggleWireframe = useUiStore((s) => s.toggleWireframe);
  const toggleGridSnap = useUiStore((s) => s.toggleGridSnap);
  const toggleFeatureTree = useUiStore((s) => s.toggleFeatureTree);

  const scene = useEngineStore((s) => s.scene);

  const commands = useMemo(() => {
    return createCommandRegistry({
      addPrimitive: (kind) => {
        const partId = addPrimitive(kind);
        select(partId);
        setTransformMode("translate");
        onOpenChange(false);
      },
      applyBoolean: (type) => {
        const ids = Array.from(selectedPartIds);
        if (ids.length === 2) {
          const newId = applyBoolean(type, ids[0]!, ids[1]!);
          if (newId) select(newId);
        }
        onOpenChange(false);
      },
      setTransformMode: (mode) => {
        setTransformMode(mode);
        onOpenChange(false);
      },
      undo: () => {
        undo();
        onOpenChange(false);
      },
      redo: () => {
        redo();
        onOpenChange(false);
      },
      toggleWireframe: () => {
        toggleWireframe();
        onOpenChange(false);
      },
      toggleGridSnap: () => {
        toggleGridSnap();
        onOpenChange(false);
      },
      toggleFeatureTree: () => {
        toggleFeatureTree();
        onOpenChange(false);
      },
      save: () => {
        window.dispatchEvent(new CustomEvent("vcad:save"));
        onOpenChange(false);
      },
      open: () => {
        window.dispatchEvent(new CustomEvent("vcad:open"));
        onOpenChange(false);
      },
      exportStl: () => {
        if (scene) {
          const blob = exportStl(scene);
          downloadBlob(blob, "model.stl");
        }
        onOpenChange(false);
      },
      exportGlb: () => {
        if (scene) {
          const blob = exportGltf(scene);
          downloadBlob(blob, "model.glb");
        }
        onOpenChange(false);
      },
      openAbout: () => {
        onAboutOpen();
        onOpenChange(false);
      },
      deleteSelected: () => {
        for (const id of selectedPartIds) {
          removePart(id);
        }
        clearSelection();
        onOpenChange(false);
      },
      duplicateSelected: () => {
        if (selectedPartIds.size > 0) {
          const ids = Array.from(selectedPartIds);
          const newIds = duplicateParts(ids);
          selectMultiple(newIds);
        }
        onOpenChange(false);
      },
      deselectAll: () => {
        clearSelection();
        onOpenChange(false);
      },
      hasTwoSelected: () => selectedPartIds.size === 2,
      hasSelection: () => selectedPartIds.size > 0,
      hasParts: () => parts.length > 0,
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
    });
  }, [
    addPrimitive,
    applyBoolean,
    clearSelection,
    duplicateParts,
    onAboutOpen,
    onOpenChange,
    parts.length,
    redo,
    redoStack.length,
    removePart,
    scene,
    select,
    selectMultiple,
    selectedPartIds,
    setTransformMode,
    toggleFeatureTree,
    toggleGridSnap,
    toggleWireframe,
    undo,
    undoStack.length,
  ]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((cmd) => {
      if (cmd.label.toLowerCase().includes(q)) return true;
      return cmd.keywords.some((kw) => kw.includes(q));
    });
  }, [commands, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset query when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector("[data-selected=true]");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const executeCommand = useCallback(
    (cmd: Command) => {
      if (cmd.enabled && !cmd.enabled()) return;
      cmd.action();
    },
    [],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) executeCommand(cmd);
        break;
      case "Escape":
        onOpenChange(false);
        break;
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[20%] z-50 w-full max-w-md -translate-x-1/2  border border-border bg-card shadow-2xl"
          onKeyDown={handleKeyDown}
          aria-describedby={undefined}
        >
          <VisuallyHidden>
            <Dialog.Title>Command Palette</Dialog.Title>
          </VisuallyHidden>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <MagnifyingGlass size={16} className="text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command..."
              className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
              autoFocus
            />
            <kbd className=" bg-border/50 px-1.5 py-0.5 text-[10px] text-text-muted">esc</kbd>
          </div>
          <div ref={listRef} className="max-h-[300px] overflow-y-auto p-1">
            {filteredCommands.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-text-muted">
                No commands found
              </div>
            ) : (
              filteredCommands.map((cmd, idx) => {
                const Icon = ICONS[cmd.icon] ?? Cube;
                const isDisabled = cmd.enabled && !cmd.enabled();
                const isSelected = idx === selectedIndex;

                return (
                  <button
                    key={cmd.id}
                    data-selected={isSelected}
                    disabled={isDisabled}
                    onClick={() => executeCommand(cmd)}
                    className={cn(
                      "flex w-full items-center gap-3  px-3 py-2 text-left text-sm transition-colors",
                      isSelected && !isDisabled && "bg-accent/20",
                      isDisabled && "opacity-40 cursor-not-allowed",
                      !isSelected && !isDisabled && "hover:bg-border/30",
                    )}
                  >
                    <Icon size={16} className="shrink-0 text-text-muted" />
                    <span className="flex-1">{highlightMatch(cmd.label, query)}</span>
                    {cmd.shortcut && (
                      <kbd className=" bg-border/50 px-1.5 py-0.5 text-[10px] text-text-muted">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
