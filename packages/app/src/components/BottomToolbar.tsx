import {
  Cube,
  Cylinder,
  Globe,
  Unite,
  Subtract,
  Intersect,
  ArrowsOutCardinal,
  ArrowsClockwise,
  ArrowsOut,
  PencilSimple,
  Command,
} from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui/tooltip";
import { useDocumentStore, useUiStore, useSketchStore, useEngineStore } from "@vcad/core";
import type { PrimitiveKind, BooleanType } from "@vcad/core";
import { cn } from "@/lib/utils";

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

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  tooltip,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  tooltip: string;
}) {
  return (
    <Tooltip content={tooltip}>
      <button
        className={cn(
          "flex h-10 w-10 items-center justify-center",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          active
            ? "bg-accent text-white"
            : "text-text-muted hover:bg-white/10 hover:text-text"
        )}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Divider() {
  return <div className="h-6 w-px bg-border" />;
}

function StatusSection() {
  const parts = useDocumentStore((s) => s.parts);
  const loading = useEngineStore((s) => s.loading);
  const error = useEngineStore((s) => s.error);
  const gridSnap = useUiStore((s) => s.gridSnap);
  const snapIncrement = useUiStore((s) => s.snapIncrement);

  const partCount = parts.length;

  let status = "Ready";
  if (loading) status = "Evaluating...";
  if (error) status = "Error";

  return (
    <div className="flex items-center gap-2 text-xs text-text-muted">
      <span className={error ? "text-danger" : ""}>{status}</span>
      {partCount > 0 && (
        <>
          <span className="text-border">·</span>
          <span>{partCount} part{partCount !== 1 ? "s" : ""}</span>
        </>
      )}
      <span className="text-border">·</span>
      <span className={gridSnap ? "text-accent" : ""}>
        {gridSnap ? `${snapIncrement}mm` : "snap off"}
      </span>
    </div>
  );
}

export function BottomToolbar() {
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const applyBoolean = useDocumentStore((s) => s.applyBoolean);

  const select = useUiStore((s) => s.select);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const transformMode = useUiStore((s) => s.transformMode);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);

  const enterSketchMode = useSketchStore((s) => s.enterSketchMode);
  const enterFaceSelectionMode = useSketchStore((s) => s.enterFaceSelectionMode);
  const sketchActive = useSketchStore((s) => s.active);
  const faceSelectionMode = useSketchStore((s) => s.faceSelectionMode);
  const parts = useDocumentStore((s) => s.parts);

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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5",
          "bg-surface",
          "border border-border",
          "shadow-lg shadow-black/30"
        )}
      >
        {/* Primitives */}
        {PRIMITIVES.map(({ kind, icon: Icon, label }) => (
          <ToolbarButton
            key={kind}
            tooltip={`Add ${label}`}
            disabled={sketchActive}
            onClick={() => handleAddPrimitive(kind)}
          >
            <Icon size={20} />
          </ToolbarButton>
        ))}

        {/* Sketch */}
        <ToolbarButton
          tooltip="New Sketch (S)"
          active={faceSelectionMode}
          disabled={sketchActive}
          onClick={() => {
            if (parts.length > 0) {
              enterFaceSelectionMode();
            } else {
              enterSketchMode("XY");
            }
          }}
        >
          <PencilSimple size={20} />
        </ToolbarButton>

        <Divider />

        {/* Boolean operations */}
        {BOOLEANS.map(({ type, icon: Icon, label, shortcut }) => (
          <ToolbarButton
            key={type}
            tooltip={`${label} (${shortcut})`}
            disabled={!hasTwoSelected}
            onClick={() => handleBoolean(type)}
          >
            <Icon size={20} />
          </ToolbarButton>
        ))}

        <Divider />

        {/* Transform mode */}
        <ToolbarButton
          tooltip="Move (W)"
          active={hasSelection && transformMode === "translate"}
          disabled={!hasSelection}
          onClick={() => setTransformMode("translate")}
        >
          <ArrowsOutCardinal size={20} />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Rotate (E)"
          active={hasSelection && transformMode === "rotate"}
          disabled={!hasSelection}
          onClick={() => setTransformMode("rotate")}
        >
          <ArrowsClockwise size={20} />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Scale (R)"
          active={hasSelection && transformMode === "scale"}
          disabled={!hasSelection}
          onClick={() => setTransformMode("scale")}
        >
          <ArrowsOut size={20} />
        </ToolbarButton>

        <Divider />

        {/* Status */}
        <div className="px-2">
          <StatusSection />
        </div>

        <Divider />

        {/* Command palette */}
        <ToolbarButton
          tooltip="Command Palette (⌘K)"
          onClick={toggleCommandPalette}
        >
          <Command size={20} />
        </ToolbarButton>
      </div>
    </div>
  );
}
