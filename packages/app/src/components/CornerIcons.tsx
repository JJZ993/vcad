import { Sun, Moon, Command, DotsThree, List } from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@/components/ui/tooltip";
import { useDocumentStore, useUiStore, useEngineStore, exportStlBlob, exportGltfBlob, getUndoActionName, getRedoActionName } from "@vcad/core";
import { downloadBlob } from "@/lib/download";
import { useToastStore } from "@/stores/toast-store";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  FloppyDisk,
  FolderOpen,
  Export,
  Info,
  CubeTransparent,
  GridFour,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface CornerIconsProps {
  onAboutOpen: () => void;
  onSave: () => void;
  onOpen: () => void;
}

function IconButton({
  children,
  onClick,
  tooltip,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tooltip: string;
  active?: boolean;
}) {
  return (
    <Tooltip content={tooltip}>
      <button
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
          "text-text-muted/70 hover:text-text hover:bg-white/10",
          active && "text-accent"
        )}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function SettingsMenu({
  onAboutOpen,
  onSave,
  onOpen,
}: {
  onAboutOpen: () => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const undoStack = useDocumentStore((s) => s.undoStack);
  const redoStack = useDocumentStore((s) => s.redoStack);
  const undoActionName = useDocumentStore(getUndoActionName);
  const redoActionName = useDocumentStore(getRedoActionName);
  const parts = useDocumentStore((s) => s.parts);

  const showWireframe = useUiStore((s) => s.showWireframe);
  const toggleWireframe = useUiStore((s) => s.toggleWireframe);
  const gridSnap = useUiStore((s) => s.gridSnap);
  const toggleGridSnap = useUiStore((s) => s.toggleGridSnap);
  const snapIncrement = useUiStore((s) => s.snapIncrement);
  const setSnapIncrement = useUiStore((s) => s.setSnapIncrement);

  const scene = useEngineStore((s) => s.scene);

  const hasParts = parts.length > 0;

  function handleExportStl() {
    if (!scene) return;
    const blob = exportStlBlob(scene);
    downloadBlob(blob, "model.stl");
    useToastStore.getState().addToast("Exported model.stl", "success");
  }

  function handleExportGlb() {
    if (!scene) return;
    const blob = exportGltfBlob(scene);
    downloadBlob(blob, "model.glb");
    useToastStore.getState().addToast("Exported model.glb", "success");
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
            "text-text-muted/70 hover:text-text hover:bg-white/10"
          )}
        >
          <DotsThree size={20} weight="bold" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-56 rounded-xl border border-border/50 bg-surface/95 backdrop-blur-md p-2 shadow-xl"
          sideOffset={8}
          align="end"
        >
          <div className="grid grid-cols-2 gap-1">
            {/* Edit */}
            <div className="col-span-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Edit
            </div>
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              title={undoActionName ? `Undo: ${undoActionName} (⌘Z)` : "Undo (⌘Z)"}
            >
              <ArrowCounterClockwise size={14} />
              <span>{undoActionName ? `Undo: ${undoActionName}` : "Undo"}</span>
              <span className="ml-auto text-text-muted">⌘Z</span>
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              title={redoActionName ? `Redo: ${redoActionName} (⌘⇧Z)` : "Redo (⌘⇧Z)"}
            >
              <ArrowClockwise size={14} />
              <span>{redoActionName ? `Redo: ${redoActionName}` : "Redo"}</span>
              <span className="ml-auto text-text-muted">⌘⇧Z</span>
            </button>

            {/* View */}
            <div className="col-span-2 mt-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              View
            </div>
            <button
              onClick={toggleWireframe}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10"
            >
              <CubeTransparent size={14} className={showWireframe ? "text-accent" : ""} />
              <span>Wireframe</span>
              <span className="ml-auto text-text-muted">X</span>
            </button>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className="col-span-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10"
                >
                  <GridFour size={14} className={gridSnap ? "text-accent" : ""} />
                  <span>Grid Snap</span>
                  <span className="ml-auto text-text-muted">{gridSnap ? `${snapIncrement}mm` : "Off"}</span>
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 rounded-lg border border-border/50 bg-surface/95 backdrop-blur-md p-1.5 shadow-xl"
                  side="right"
                  sideOffset={4}
                  align="start"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={toggleGridSnap}
                      className="flex items-center gap-2 rounded px-2 py-1 text-xs text-text hover:bg-white/10"
                    >
                      <span className={!gridSnap ? "text-accent" : ""}>Off</span>
                    </button>
                    {[1, 2, 5, 10, 25, 50].map((v) => (
                      <button
                        key={v}
                        onClick={() => setSnapIncrement(v)}
                        className="flex items-center gap-2 rounded px-2 py-1 text-xs text-text hover:bg-white/10"
                      >
                        <span className={gridSnap && snapIncrement === v ? "text-accent" : ""}>{v}mm</span>
                      </button>
                    ))}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            {/* File */}
            <div className="col-span-2 mt-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              File
            </div>
            <button
              onClick={onSave}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10"
            >
              <FloppyDisk size={14} />
              <span>Save</span>
              <span className="ml-auto text-text-muted">⌘S</span>
            </button>
            <button
              onClick={onOpen}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10"
            >
              <FolderOpen size={14} />
              <span>Open</span>
              <span className="ml-auto text-text-muted">⌘O</span>
            </button>
            <button
              onClick={handleExportStl}
              disabled={!hasParts}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Export size={14} />
              <span>Export STL</span>
            </button>
            <button
              onClick={handleExportGlb}
              disabled={!hasParts}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Export size={14} weight="fill" />
              <span>Export GLB</span>
            </button>

            {/* Help */}
            <div className="col-span-2 mt-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Help
            </div>
            <button
              onClick={onAboutOpen}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-white/10"
            >
              <Info size={14} />
              <span>About</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function CornerIcons({ onAboutOpen, onSave, onOpen }: CornerIconsProps) {
  const isDirty = useDocumentStore((s) => s.isDirty);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);
  const toggleFeatureTree = useUiStore((s) => s.toggleFeatureTree);
  const featureTreeOpen = useUiStore((s) => s.featureTreeOpen);

  return (
    <>
      {/* Top-left: hamburger + logo */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <IconButton
          tooltip="Toggle sidebar (`)"
          onClick={toggleFeatureTree}
          active={featureTreeOpen}
        >
          <List size={20} />
        </IconButton>
        <div className="flex items-center gap-1 pl-1">
          <span className="text-sm font-bold tracking-tighter text-text">
            vcad<span className="text-accent">.</span>
          </span>
          {isDirty && <span className="text-accent text-xs">*</span>}
        </div>
      </div>

      {/* Top-right: theme, command palette, settings */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1">
        <IconButton
          tooltip="Command palette (⌘K)"
          onClick={toggleCommandPalette}
        >
          <Command size={18} />
        </IconButton>
        <IconButton
          tooltip={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
        <SettingsMenu onAboutOpen={onAboutOpen} onSave={onSave} onOpen={onOpen} />
      </div>
    </>
  );
}
