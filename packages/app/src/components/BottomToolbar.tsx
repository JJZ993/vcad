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
  Cube as Cube3D,
  Blueprint,
  Eye,
  EyeSlash,
  Ruler,
  Download,
  MagnifyingGlassPlus,
  X,
} from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  useDocumentStore,
  useUiStore,
  useSketchStore,
  useEngineStore,
} from "@vcad/core";
import type { PrimitiveKind, BooleanType } from "@vcad/core";
import { downloadDxf } from "@/lib/save-load";
import { useToastStore } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { InsertInstanceDialog, AddJointDialog } from "@/components/dialogs";
import { useOnboardingStore, type GuidedFlowStep } from "@/stores/onboarding-store";
import { useDrawingStore, type ViewDirection } from "@/stores/drawing-store";

const VIEW_DIRECTIONS: { value: ViewDirection; label: string }[] = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "isometric", label: "Isometric" },
];

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
  pulse,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  tooltip: string;
  pulse?: boolean;
}) {
  return (
    <Tooltip content={tooltip}>
      <button
        className={cn(
          // Mobile: 44px touch targets (iOS minimum)
          "flex h-11 w-11 min-w-[44px] items-center justify-center relative",
          // Desktop: 40px
          "sm:h-10 sm:w-10 sm:min-w-0",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          active
            ? "bg-accent text-white"
            : "text-text-muted hover:bg-hover hover:text-text",
          pulse && "animate-pulse ring-2 ring-accent ring-offset-1 ring-offset-surface",
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

  // Drawing view state
  const viewMode = useDrawingStore((s) => s.viewMode);
  const setViewMode = useDrawingStore((s) => s.setViewMode);
  const viewDirection = useDrawingStore((s) => s.viewDirection);
  const setViewDirection = useDrawingStore((s) => s.setViewDirection);
  const showHiddenLines = useDrawingStore((s) => s.showHiddenLines);
  const toggleHiddenLines = useDrawingStore((s) => s.toggleHiddenLines);
  const showDimensions = useDrawingStore((s) => s.showDimensions);
  const toggleDimensions = useDrawingStore((s) => s.toggleDimensions);
  const detailViews = useDrawingStore((s) => s.detailViews);
  const clearDetailViews = useDrawingStore((s) => s.clearDetailViews);

  // Engine for DXF export
  const engine = useEngineStore((s) => s.engine);
  const scene = useEngineStore((s) => s.scene);

  // Guided flow state
  const guidedFlowActive = useOnboardingStore((s) => s.guidedFlowActive);
  const guidedFlowStep = useOnboardingStore((s) => s.guidedFlowStep);
  const advanceGuidedFlow = useOnboardingStore((s) => s.advanceGuidedFlow);

  // Helper to check if a button should pulse during guided flow
  function shouldPulse(
    forStep: GuidedFlowStep,
    extraCondition: boolean = true
  ): boolean {
    return guidedFlowActive && guidedFlowStep === forStep && extraCondition;
  }

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

    // Advance guided flow if applicable
    if (guidedFlowActive) {
      if (guidedFlowStep === "add-cube" && kind === "cube") {
        advanceGuidedFlow();
      } else if (guidedFlowStep === "add-cylinder" && kind === "cylinder") {
        advanceGuidedFlow();
      }
    }
  }

  function handleBoolean(type: BooleanType) {
    if (!hasTwoSelected) return;
    const ids = Array.from(selectedPartIds);
    const newId = applyBoolean(type, ids[0]!, ids[1]!);
    if (newId) select(newId);

    // Advance guided flow if subtracting during tutorial
    if (guidedFlowActive && guidedFlowStep === "subtract" && type === "difference") {
      advanceGuidedFlow();
    }
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
    {/* Mobile: full-width fixed at bottom; Desktop: centered floating */}
    <div className="fixed bottom-0 inset-x-0 sm:absolute sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:inset-auto z-20 pb-[var(--safe-bottom)]">
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5",
          "bg-surface",
          // Mobile: border only on top, full width; Desktop: full border
          "border-t sm:border border-border",
          "shadow-lg shadow-black/30",
          // Mobile: horizontal scroll
          "overflow-x-auto scrollbar-thin",
        )}
      >
        {/* Primitives */}
        {PRIMITIVES.map(({ kind, icon: Icon, label }) => (
          <ToolbarButton
            key={kind}
            tooltip={`Add ${label}`}
            disabled={sketchActive}
            onClick={() => handleAddPrimitive(kind)}
            pulse={
              (kind === "cube" && shouldPulse("add-cube")) ||
              (kind === "cylinder" && shouldPulse("add-cylinder"))
            }
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
            pulse={type === "difference" && shouldPulse("subtract")}
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
          disabled={!hasSelection || viewMode === "2d"}
          onClick={() => setTransformMode("translate")}
        >
          <ArrowsOutCardinal size={20} />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Rotate (R)"
          active={hasSelection && transformMode === "rotate"}
          disabled={!hasSelection || viewMode === "2d"}
          onClick={() => setTransformMode("rotate")}
        >
          <ArrowsClockwise size={20} />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Scale (S)"
          active={hasSelection && transformMode === "scale"}
          disabled={!hasSelection || viewMode === "2d"}
          onClick={() => setTransformMode("scale")}
        >
          <ArrowsOut size={20} />
        </ToolbarButton>

        <Divider />

        {/* View mode toggle */}
        <ToolbarButton
          tooltip="3D View"
          active={viewMode === "3d"}
          onClick={() => setViewMode("3d")}
        >
          <Cube3D size={20} />
        </ToolbarButton>
        <ToolbarButton
          tooltip="2D Drawing View"
          active={viewMode === "2d"}
          onClick={() => setViewMode("2d")}
        >
          <Blueprint size={20} />
        </ToolbarButton>

        {/* 2D view options (shown when in 2D mode) */}
        {viewMode === "2d" && (
          <>
            <Divider />

            {/* View direction selector */}
            <select
              value={viewDirection}
              onChange={(e) => setViewDirection(e.target.value as ViewDirection)}
              className="h-8 px-2 text-sm bg-surface border border-border rounded text-text"
            >
              {VIEW_DIRECTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            {/* Hidden lines toggle */}
            <ToolbarButton
              tooltip={showHiddenLines ? "Hide Hidden Lines" : "Show Hidden Lines"}
              active={showHiddenLines}
              onClick={toggleHiddenLines}
            >
              {showHiddenLines ? <Eye size={20} /> : <EyeSlash size={20} />}
            </ToolbarButton>

            {/* Dimensions toggle */}
            <ToolbarButton
              tooltip={showDimensions ? "Hide Dimensions" : "Show Dimensions"}
              active={showDimensions}
              onClick={toggleDimensions}
            >
              <Ruler size={20} />
            </ToolbarButton>

            <Divider />

            {/* Detail view tools */}
            <ToolbarButton
              tooltip="Add Detail View (drag to select region)"
              disabled={!scene?.parts?.length}
              onClick={() => {
                // Dispatch event to DrawingView to start detail creation mode
                window.dispatchEvent(new CustomEvent("vcad:start-detail-view"));
              }}
            >
              <MagnifyingGlassPlus size={20} />
            </ToolbarButton>

            {detailViews.length > 0 && (
              <ToolbarButton
                tooltip="Clear Detail Views"
                onClick={clearDetailViews}
              >
                <X size={20} />
              </ToolbarButton>
            )}

            <Divider />

            {/* DXF Export */}
            <ToolbarButton
              tooltip="Export DXF"
              disabled={!scene?.parts?.length || !engine}
              onClick={() => {
                if (!scene?.parts?.length || !engine) return;
                try {
                  // Project the first part's mesh
                  const mesh = scene.parts[0]!.mesh;
                  const projectedView = engine.projectMesh(mesh, viewDirection);
                  if (!projectedView) {
                    useToastStore.getState().addToast("Failed to project view", "error");
                    return;
                  }
                  const dxfData = engine.exportDrawingToDxf(projectedView);
                  downloadDxf(dxfData, `drawing-${viewDirection}.dxf`);
                  useToastStore.getState().addToast("DXF exported", "success");
                } catch (err) {
                  console.error("DXF export failed:", err);
                  useToastStore.getState().addToast("DXF export failed", "error");
                }
              }}
            >
              <Download size={20} />
            </ToolbarButton>
          </>
        )}

      </div>
    </div>
    </>
  );
}
