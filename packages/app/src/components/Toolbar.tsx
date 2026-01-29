import {
  Cube,
  Cylinder,
  Globe,
  ArrowCounterClockwise,
  ArrowClockwise,
  SidebarSimple,
  Info,
  Unite,
  Subtract,
  Intersect,
  FloppyDisk,
  FolderOpen,
  Export,
  GridFour,
  CubeTransparent,
  DotsThree,
  Command,
  PencilSimple,
  Stack,
  ArrowsOutCardinal,
  ArrowsClockwise,
  ArrowsOut,
} from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useDocumentStore, useUiStore, useEngineStore, useSketchStore, exportStlBlob, exportGltfBlob, getUndoActionName, getRedoActionName } from "@vcad/core";
import type { PrimitiveKind, BooleanType } from "@vcad/core";
import { downloadBlob } from "@/lib/download";
import { useToastStore } from "@/stores/toast-store";

const PRIMITIVES: { kind: PrimitiveKind; icon: typeof Cube; label: string }[] =
  [
    { kind: "cube", icon: Cube, label: "Box" },
    { kind: "cylinder", icon: Cylinder, label: "Cylinder" },
    { kind: "sphere", icon: Globe, label: "Sphere" },
  ];

const BOOLEANS: {
  type: BooleanType;
  icon: typeof Unite;
  label: string;
  shortcut: string;
}[] = [
  { type: "union", icon: Unite, label: "Union", shortcut: "⌘⇧U" },
  { type: "difference", icon: Subtract, label: "Difference", shortcut: "⌘⇧D" },
  { type: "intersection", icon: Intersect, label: "Intersection", shortcut: "⌘⇧I" },
];

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
              className="flex items-center gap-2  px-2 py-1.5 text-xs text-text hover:bg-border/30 disabled:opacity-40 disabled:cursor-not-allowed"
              title={undoActionName ? `Undo: ${undoActionName} (⌘Z)` : "Undo (⌘Z)"}
            >
              <ArrowCounterClockwise size={14} />
              <span>{undoActionName ? `Undo: ${undoActionName}` : "Undo"}</span>
              <span className="ml-auto text-text-muted">⌘Z</span>
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              className="flex items-center gap-2  px-2 py-1.5 text-xs text-text hover:bg-border/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="flex items-center gap-2  px-2 py-1.5 text-xs text-text hover:bg-border/30"
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
              className="flex items-center gap-2  px-2 py-1.5 text-xs text-text hover:bg-border/30"
            >
              <FloppyDisk size={14} />
              <span>Save</span>
              <span className="ml-auto text-text-muted">⌘S</span>
            </button>
            <button
              onClick={onOpen}
              className="flex items-center gap-2  px-2 py-1.5 text-xs text-text hover:bg-border/30"
            >
              <FolderOpen size={14} />
              <span>Open</span>
              <span className="ml-auto text-text-muted">⌘O</span>
            </button>
            <button
              onClick={handleExportStl}
              disabled={!hasParts}
              className="flex items-center gap-2  px-2 py-1.5 text-xs text-text hover:bg-border/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Export size={14} />
              <span>Export STL</span>
            </button>
            <button
              onClick={handleExportGlb}
              disabled={!hasParts}
              className="flex items-center gap-2  px-2 py-1.5 text-xs text-text hover:bg-border/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="flex items-center gap-2  px-2 py-1.5 text-xs text-text hover:bg-border/30"
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

export function Toolbar({
  onAboutOpen,
  onSave,
  onOpen,
}: {
  onAboutOpen: () => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const applyBoolean = useDocumentStore((s) => s.applyBoolean);

  const select = useUiStore((s) => s.select);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const transformMode = useUiStore((s) => s.transformMode);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const toggleFeatureTree = useUiStore((s) => s.toggleFeatureTree);
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);

  const enterSketchMode = useSketchStore((s) => s.enterSketchMode);
  const sketchActive = useSketchStore((s) => s.active);

  const hasSelection = selectedPartIds.size > 0;
  const hasTwoSelected = selectedPartIds.size === 2;

  function handleAddPrimitive(kind: PrimitiveKind) {
    const partId = addPrimitive(kind);
    select(partId);
    setTransformMode("translate");
  }

  function handleBoolean(type: BooleanType) {
    if (!hasTwoSelected) return;
    const ids = Array.from(selectedPartIds);
    const newId = applyBoolean(type, ids[0]!, ids[1]!);
    if (newId) select(newId);
  }

  return (
    <div className="fixed left-1/2 top-3 z-30 -translate-x-1/2">
      <div className="flex items-center gap-1 border border-border bg-card px-2 py-1.5 shadow-2xl">
        {/* Feature tree toggle */}
        <Tooltip content="Toggle sidebar">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleFeatureTree}
          >
            <SidebarSimple size={16} />
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Primitives */}
        {PRIMITIVES.map(({ kind, icon: Icon, label }) => (
          <Tooltip key={kind} content={`Add ${label}`}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => handleAddPrimitive(kind)}
              disabled={sketchActive}
            >
              <Icon size={16} />
            </Button>
          </Tooltip>
        ))}

        {/* Sketch */}
        <Tooltip content="New Sketch (S)">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => enterSketchMode("XY")}
            disabled={sketchActive}
          >
            <PencilSimple size={16} />
          </Button>
        </Tooltip>

        {/* Loft */}
        <Tooltip content="Loft (L)">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              const { enterLoftMode } = useSketchStore.getState();
              enterLoftMode("XY");
            }}
            disabled={sketchActive}
          >
            <Stack size={16} />
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Boolean operations */}
        {BOOLEANS.map(({ type, icon: Icon, label, shortcut }) => (
          <Tooltip key={type} content={`${label} (${shortcut})`}>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!hasTwoSelected}
              onClick={() => handleBoolean(type)}
            >
              <Icon size={16} />
            </Button>
          </Tooltip>
        ))}

        {/* Transform mode - only when part selected */}
        {hasSelection && (
          <>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <Tooltip content="Move (W)">
              <Button
                variant={transformMode === "translate" ? "default" : "ghost"}
                size="icon-sm"
                onClick={() => setTransformMode("translate")}
              >
                <ArrowsOutCardinal size={16} />
              </Button>
            </Tooltip>
            <Tooltip content="Rotate (E)">
              <Button
                variant={transformMode === "rotate" ? "default" : "ghost"}
                size="icon-sm"
                onClick={() => setTransformMode("rotate")}
              >
                <ArrowsClockwise size={16} />
              </Button>
            </Tooltip>
            <Tooltip content="Scale (R)">
              <Button
                variant={transformMode === "scale" ? "default" : "ghost"}
                size="icon-sm"
                onClick={() => setTransformMode("scale")}
              >
                <ArrowsOut size={16} />
              </Button>
            </Tooltip>
          </>
        )}

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Overflow menu */}
        <OverflowMenu
          onAboutOpen={onAboutOpen}
          onSave={onSave}
          onOpen={onOpen}
        />

        {/* Command palette trigger */}
        <Tooltip content="Command palette (⌘K)">
          <Button variant="ghost" size="icon-sm" onClick={toggleCommandPalette}>
            <Command size={16} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
