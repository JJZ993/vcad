import {
  Cube,
  Cylinder,
  Globe,
  ArrowsOutCardinal,
  ArrowClockwise,
  ArrowsOut,
  ArrowCounterClockwise,
  SidebarSimple,
  Sun,
  Moon,
  Info,
  Unite,
  Subtract,
  Intersect,
  FloppyDisk,
  FolderOpen,
  Export,
  GridFour,
  CubeTransparent,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useDocumentStore } from "@/stores/document-store";
import { useUiStore } from "@/stores/ui-store";
import { useEngineStore } from "@/stores/engine-store";
import { useTheme } from "@/hooks/useTheme";
import type { PrimitiveKind, TransformMode, BooleanType } from "@/types";
import { exportStl } from "@/lib/export-stl";
import { exportGltf } from "@/lib/export-gltf";
import { downloadBlob } from "@/lib/download";

const PRIMITIVES: { kind: PrimitiveKind; icon: typeof Cube; label: string }[] =
  [
    { kind: "cube", icon: Cube, label: "Box" },
    { kind: "cylinder", icon: Cylinder, label: "Cylinder" },
    { kind: "sphere", icon: Globe, label: "Sphere" },
  ];

const TRANSFORM_MODES: {
  mode: TransformMode;
  icon: typeof ArrowsOutCardinal;
  label: string;
  shortcut: string;
}[] = [
  {
    mode: "translate",
    icon: ArrowsOutCardinal,
    label: "Move",
    shortcut: "W",
  },
  { mode: "rotate", icon: ArrowClockwise, label: "Rotate", shortcut: "E" },
  { mode: "scale", icon: ArrowsOut, label: "Scale", shortcut: "R" },
];

const BOOLEANS: {
  type: BooleanType;
  icon: typeof Unite;
  label: string;
  shortcut: string;
}[] = [
  { type: "union", icon: Unite, label: "Union", shortcut: "Ctrl+Shift+U" },
  {
    type: "difference",
    icon: Subtract,
    label: "Difference",
    shortcut: "Ctrl+Shift+D",
  },
  {
    type: "intersection",
    icon: Intersect,
    label: "Intersection",
    shortcut: "Ctrl+Shift+I",
  },
];

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
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const undoStack = useDocumentStore((s) => s.undoStack);
  const redoStack = useDocumentStore((s) => s.redoStack);
  const parts = useDocumentStore((s) => s.parts);

  const select = useUiStore((s) => s.select);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const transformMode = useUiStore((s) => s.transformMode);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const toggleFeatureTree = useUiStore((s) => s.toggleFeatureTree);
  const showWireframe = useUiStore((s) => s.showWireframe);
  const toggleWireframe = useUiStore((s) => s.toggleWireframe);
  const gridSnap = useUiStore((s) => s.gridSnap);
  const toggleGridSnap = useUiStore((s) => s.toggleGridSnap);

  const scene = useEngineStore((s) => s.scene);

  const { isDark, toggleTheme } = useTheme();

  const hasTwoSelected = selectedPartIds.size === 2;
  const hasParts = parts.length > 0;

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

  function handleExportStl() {
    if (!scene) return;
    const blob = exportStl(scene);
    downloadBlob(blob, "model.stl");
  }

  function handleExportGlb() {
    if (!scene) return;
    const blob = exportGltf(scene);
    downloadBlob(blob, "model.glb");
  }

  return (
    <div className="fixed left-1/2 top-3 z-30 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card/80 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
        {/* Feature tree toggle */}
        <Tooltip content="Feature tree">
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
            >
              <Icon size={16} />
            </Button>
          </Tooltip>
        ))}

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

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Transform modes */}
        {TRANSFORM_MODES.map(({ mode, icon: Icon, label, shortcut }) => (
          <Tooltip key={mode} content={`${label} (${shortcut})`}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTransformMode(mode)}
              className={
                transformMode === mode
                  ? "bg-accent/20 text-accent"
                  : undefined
              }
            >
              <Icon size={16} />
            </Button>
          </Tooltip>
        ))}

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Wireframe toggle */}
        <Tooltip content="Wireframe (X)">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleWireframe}
            className={showWireframe ? "bg-accent/20 text-accent" : undefined}
          >
            <CubeTransparent size={16} />
          </Button>
        </Tooltip>

        {/* Grid snap toggle */}
        <Tooltip content="Grid snap (G)">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleGridSnap}
            className={gridSnap ? "bg-accent/20 text-accent" : undefined}
          >
            <GridFour size={16} />
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Undo/Redo */}
        <Tooltip content="Undo (Ctrl+Z)">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={undo}
            disabled={undoStack.length === 0}
          >
            <ArrowCounterClockwise size={16} />
          </Button>
        </Tooltip>
        <Tooltip content="Redo (Ctrl+Shift+Z)">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={redo}
            disabled={redoStack.length === 0}
          >
            <ArrowClockwise size={16} />
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Save/Open */}
        <Tooltip content="Save (Ctrl+S)">
          <Button variant="ghost" size="icon-sm" onClick={onSave}>
            <FloppyDisk size={16} />
          </Button>
        </Tooltip>
        <Tooltip content="Open (Ctrl+O)">
          <Button variant="ghost" size="icon-sm" onClick={onOpen}>
            <FolderOpen size={16} />
          </Button>
        </Tooltip>

        {/* Export */}
        <Tooltip content="Export STL">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!hasParts}
            onClick={handleExportStl}
          >
            <Export size={16} />
          </Button>
        </Tooltip>
        <Tooltip content="Export GLB">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!hasParts}
            onClick={handleExportGlb}
          >
            <Export size={16} weight="fill" />
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Theme toggle */}
        <Tooltip content={isDark ? "Light mode" : "Dark mode"}>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* About */}
        <Tooltip content="About vcad">
          <Button variant="ghost" size="icon-sm" onClick={onAboutOpen}>
            <Info size={16} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
