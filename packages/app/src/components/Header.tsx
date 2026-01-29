import { Sun, Moon, Command, DotsThree, ArrowCounterClockwise, ArrowClockwise, FloppyDisk, FolderOpen, Export, Info, CubeTransparent, GridFour } from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useDocumentStore, useUiStore, useEngineStore, exportStlBlob, exportGltfBlob, getUndoActionName, getRedoActionName } from "@vcad/core";
import { downloadBlob } from "@/lib/download";
import { useToastStore } from "@/stores/toast-store";

interface HeaderProps {
  onAboutOpen: () => void;
  onSave: () => void;
  onOpen: () => void;
}

function OverflowMenu({
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
        <Button variant="ghost" size="icon-sm">
          <DotsThree size={16} weight="bold" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-56 border border-border bg-card p-2 shadow-2xl"
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
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30 disabled:opacity-40 disabled:cursor-not-allowed"
              title={undoActionName ? `Undo: ${undoActionName} (⌘Z)` : "Undo (⌘Z)"}
            >
              <ArrowCounterClockwise size={14} />
              <span>{undoActionName ? `Undo: ${undoActionName}` : "Undo"}</span>
              <span className="ml-auto text-text-muted">⌘Z</span>
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30"
            >
              <CubeTransparent size={14} className={showWireframe ? "text-accent" : ""} />
              <span>Wireframe</span>
              <span className="ml-auto text-text-muted">X</span>
            </button>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className="col-span-2 flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30"
                >
                  <GridFour size={14} className={gridSnap ? "text-accent" : ""} />
                  <span>Grid Snap</span>
                  <span className="ml-auto text-text-muted">{gridSnap ? `${snapIncrement}mm` : "Off"}</span>
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 border border-border bg-card p-1.5 shadow-2xl"
                  side="right"
                  sideOffset={4}
                  align="start"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={toggleGridSnap}
                      className="flex items-center gap-2 px-2 py-1 text-xs text-text hover:bg-border/30"
                    >
                      <span className={!gridSnap ? "text-accent" : ""}>Off</span>
                    </button>
                    {[1, 2, 5, 10, 25, 50].map((v) => (
                      <button
                        key={v}
                        onClick={() => setSnapIncrement(v)}
                        className="flex items-center gap-2 px-2 py-1 text-xs text-text hover:bg-border/30"
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
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30"
            >
              <FloppyDisk size={14} />
              <span>Save</span>
              <span className="ml-auto text-text-muted">⌘S</span>
            </button>
            <button
              onClick={onOpen}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30"
            >
              <FolderOpen size={14} />
              <span>Open</span>
              <span className="ml-auto text-text-muted">⌘O</span>
            </button>
            <button
              onClick={handleExportStl}
              disabled={!hasParts}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Export size={14} />
              <span>Export STL</span>
            </button>
            <button
              onClick={handleExportGlb}
              disabled={!hasParts}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-border/30"
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

export function Header({ onAboutOpen, onSave, onOpen }: HeaderProps) {
  const isDirty = useDocumentStore((s) => s.isDirty);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-tighter text-text">
          vcad<span className="text-accent">.</span>
        </span>
      </div>

      {/* Document name */}
      <span className="ml-4 text-xs text-text-muted">
        Untitled{isDirty && <span className="text-accent ml-0.5">*</span>}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <Tooltip content={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
        <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </Tooltip>

      {/* Command palette */}
      <Tooltip content="Command palette (⌘K)">
        <Button variant="ghost" size="icon-sm" onClick={toggleCommandPalette}>
          <Command size={16} />
        </Button>
      </Tooltip>

      {/* Overflow menu */}
      <OverflowMenu onAboutOpen={onAboutOpen} onSave={onSave} onOpen={onOpen} />
    </>
  );
}
