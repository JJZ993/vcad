import { useState, useEffect } from "react";
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
  Package,
  PlusSquare,
  LinkSimple,
} from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  useDocumentStore,
  useUiStore,
  useSketchStore,
} from "@vcad/core";
import type { PrimitiveKind, BooleanType } from "@vcad/core";
import { cn } from "@/lib/utils";
import { InsertInstanceDialog, AddJointDialog } from "@/components/dialogs";

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
  {
    type: "intersection",
    icon: Intersect,
    label: "Intersection",
    shortcut: "⌘⇧I",
  },
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
            : "text-text-muted hover:bg-hover hover:text-text",
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

export function BottomToolbar() {
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const applyBoolean = useDocumentStore((s) => s.applyBoolean);
  const createPartDef = useDocumentStore((s) => s.createPartDef);
  const document = useDocumentStore((s) => s.document);

  const select = useUiStore((s) => s.select);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const transformMode = useUiStore((s) => s.transformMode);
  const setTransformMode = useUiStore((s) => s.setTransformMode);

  const enterSketchMode = useSketchStore((s) => s.enterSketchMode);
  const enterFaceSelectionMode = useSketchStore(
    (s) => s.enterFaceSelectionMode,
  );
  const sketchActive = useSketchStore((s) => s.active);
  const faceSelectionMode = useSketchStore((s) => s.faceSelectionMode);
  const parts = useDocumentStore((s) => s.parts);

  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [jointDialogOpen, setJointDialogOpen] = useState(false);

  // Listen for insert-instance event from command palette
  useEffect(() => {
    function handleInsertInstance() {
      setInsertDialogOpen(true);
    }
    window.addEventListener("vcad:insert-instance", handleInsertInstance);
    return () =>
      window.removeEventListener("vcad:insert-instance", handleInsertInstance);
  }, []);

  const hasSelection = selectedPartIds.size > 0;
  const hasTwoSelected = selectedPartIds.size === 2;

  // Assembly mode detection
  const hasPartDefs = document.partDefs && Object.keys(document.partDefs).length > 0;
  const hasInstances = document.instances && document.instances.length > 0;
  const isAssemblyMode = hasPartDefs || hasInstances;

  // Check if we have one part selected (for create part def)
  const hasOnePartSelected = selectedPartIds.size === 1 &&
    parts.some((p) => selectedPartIds.has(p.id));

  // Check if we have two instances selected (for add joint)
  const selectedInstanceIds = Array.from(selectedPartIds).filter((id) =>
    document.instances?.some((i) => i.id === id)
  );
  const hasTwoInstancesSelected = selectedInstanceIds.length === 2;

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

  function handleCreatePartDef() {
    if (!hasOnePartSelected) return;
    const partId = Array.from(selectedPartIds)[0]!;
    const partDefId = createPartDef(partId);
    if (partDefId) {
      // Select the newly created instance
      const instance = document.instances?.find((i) => i.partDefId === partDefId);
      if (instance) {
        select(instance.id);
      }
    }
  }

  return (
    <>
      <InsertInstanceDialog
        open={insertDialogOpen}
        onOpenChange={setInsertDialogOpen}
      />
      <AddJointDialog
        open={jointDialogOpen}
        onOpenChange={setJointDialogOpen}
      />
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5",
          "bg-surface",
          "border border-border",
          "shadow-lg shadow-black/30",
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

        {/* Assembly operations */}
        <ToolbarButton
          tooltip="Create Part Definition"
          disabled={!hasOnePartSelected || sketchActive}
          onClick={handleCreatePartDef}
        >
          <Package size={20} />
        </ToolbarButton>
        {isAssemblyMode && (
          <>
            <ToolbarButton
              tooltip="Insert Instance"
              disabled={!hasPartDefs || sketchActive}
              onClick={() => setInsertDialogOpen(true)}
            >
              <PlusSquare size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip="Add Joint"
              disabled={!hasTwoInstancesSelected || sketchActive}
              onClick={() => setJointDialogOpen(true)}
            >
              <LinkSimple size={20} />
            </ToolbarButton>
          </>
        )}

        <Divider />

        {/* Transform mode */}
        <ToolbarButton
          tooltip="Move (M)"
          active={hasSelection && transformMode === "translate"}
          disabled={!hasSelection}
          onClick={() => setTransformMode("translate")}
        >
          <ArrowsOutCardinal size={20} />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Rotate (R)"
          active={hasSelection && transformMode === "rotate"}
          disabled={!hasSelection}
          onClick={() => setTransformMode("rotate")}
        >
          <ArrowsClockwise size={20} />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Scale (S)"
          active={hasSelection && transformMode === "scale"}
          disabled={!hasSelection}
          onClick={() => setTransformMode("scale")}
        >
          <ArrowsOut size={20} />
        </ToolbarButton>

      </div>
    </div>
    </>
  );
}
