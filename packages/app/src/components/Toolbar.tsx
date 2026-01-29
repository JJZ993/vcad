import {
  Cube,
  Cylinder,
  Globe,
  SidebarSimple,
  Unite,
  Subtract,
  Intersect,
  PencilSimple,
  Stack,
  ArrowsOutCardinal,
  ArrowsClockwise,
  ArrowsOut,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useDocumentStore, useUiStore, useSketchStore } from "@vcad/core";
import type { PrimitiveKind, BooleanType } from "@vcad/core";

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

export function Toolbar() {
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const applyBoolean = useDocumentStore((s) => s.applyBoolean);

  const select = useUiStore((s) => s.select);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const transformMode = useUiStore((s) => s.transformMode);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const toggleFeatureTree = useUiStore((s) => s.toggleFeatureTree);
  const featureTreeOpen = useUiStore((s) => s.featureTreeOpen);

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
    <div className="flex items-center gap-1">
      {/* Feature tree toggle */}
      <Tooltip content="Toggle sidebar">
        <Button
          variant={featureTreeOpen ? "default" : "ghost"}
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
    </div>
  );
}
