import { useState } from "react";
import {
  LineSegment,
  Rectangle,
  Circle,
  ArrowUp,
  X,
  Trash,
  ArrowsHorizontal,
  ArrowsVertical,
  Ruler,
  Equals,
  GitBranch,
  Play,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useSketchStore } from "@/stores/sketch-store";
import { useDocumentStore } from "@/stores/document-store";
import { useUiStore } from "@/stores/ui-store";
import type { SketchState, ConstraintTool } from "@/types";

const TOOLS: { tool: SketchState["tool"]; icon: typeof LineSegment; label: string }[] = [
  { tool: "rectangle", icon: Rectangle, label: "Rectangle" },
  { tool: "circle", icon: Circle, label: "Circle" },
  { tool: "line", icon: LineSegment, label: "Line" },
];

const CONSTRAINT_TOOLS: {
  tool: ConstraintTool;
  icon: typeof LineSegment;
  label: string;
  requires: number;
}[] = [
  { tool: "horizontal", icon: ArrowsHorizontal, label: "Horizontal", requires: 1 },
  { tool: "vertical", icon: ArrowsVertical, label: "Vertical", requires: 1 },
  { tool: "length", icon: Ruler, label: "Length", requires: 1 },
  { tool: "parallel", icon: GitBranch, label: "Parallel", requires: 2 },
  { tool: "equal", icon: Equals, label: "Equal Length", requires: 2 },
];

function NumberInputDialog({
  label,
  unit,
  defaultValue,
  onSubmit,
  onClose,
}: {
  label: string;
  unit: string;
  defaultValue: number;
  onSubmit: (value: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded-xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col gap-3">
        <div className="text-xs font-medium text-text">{label}</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-24 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit(value);
              if (e.key === "Escape") onClose();
            }}
          />
          <span className="text-xs text-text-muted">{unit}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onSubmit(value)}
          >
            Apply
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExtrudeDialog({
  onExtrude,
  onClose,
}: {
  onExtrude: (depth: number) => void;
  onClose: () => void;
}) {
  return (
    <NumberInputDialog
      label="Extrude Depth"
      unit="mm"
      defaultValue={20}
      onSubmit={onExtrude}
      onClose={onClose}
    />
  );
}

export function SketchToolbar() {
  const [showExtrudeDialog, setShowExtrudeDialog] = useState(false);
  const [showLengthDialog, setShowLengthDialog] = useState(false);

  const active = useSketchStore((s) => s.active);
  const plane = useSketchStore((s) => s.plane);
  const origin = useSketchStore((s) => s.origin);
  const segments = useSketchStore((s) => s.segments);
  const constraints = useSketchStore((s) => s.constraints);
  const tool = useSketchStore((s) => s.tool);
  const constraintTool = useSketchStore((s) => s.constraintTool);
  const selectedSegments = useSketchStore((s) => s.selectedSegments);
  const solved = useSketchStore((s) => s.solved);
  const setTool = useSketchStore((s) => s.setTool);
  const setConstraintTool = useSketchStore((s) => s.setConstraintTool);
  const exitSketchMode = useSketchStore((s) => s.exitSketchMode);
  const clearSketch = useSketchStore((s) => s.clearSketch);
  const applyHorizontal = useSketchStore((s) => s.applyHorizontal);
  const applyVertical = useSketchStore((s) => s.applyVertical);
  const applyLength = useSketchStore((s) => s.applyLength);
  const applyParallel = useSketchStore((s) => s.applyParallel);
  const applyEqual = useSketchStore((s) => s.applyEqual);
  const solveSketch = useSketchStore((s) => s.solveSketch);
  const clearSelection = useSketchStore((s) => s.clearSelection);

  const addExtrude = useDocumentStore((s) => s.addExtrude);
  const select = useUiStore((s) => s.select);

  if (!active) return null;

  const hasSegments = segments.length > 0;
  const hasConstraints = constraints.length > 0;
  const isConstraintMode = constraintTool !== "none";

  function handleConstraintToolClick(ct: ConstraintTool) {
    if (constraintTool === ct) {
      // Toggle off
      clearSelection();
    } else {
      setConstraintTool(ct);
    }
  }

  function handleApplyConstraint() {
    switch (constraintTool) {
      case "horizontal":
        applyHorizontal();
        break;
      case "vertical":
        applyVertical();
        break;
      case "length":
        if (selectedSegments.length === 1) {
          setShowLengthDialog(true);
        }
        break;
      case "parallel":
        applyParallel();
        break;
      case "equal":
        applyEqual();
        break;
    }
  }

  // Check if we have enough segments selected for current constraint tool
  const currentToolReq = CONSTRAINT_TOOLS.find((t) => t.tool === constraintTool)?.requires ?? 0;
  const canApplyConstraint = selectedSegments.length === currentToolReq;

  function handleExtrude(depth: number) {
    if (!hasSegments) return;

    // Determine extrusion direction based on plane
    const direction = (() => {
      switch (plane) {
        case "XY":
          return { x: 0, y: 0, z: depth };
        case "XZ":
          return { x: 0, y: depth, z: 0 };
        case "YZ":
          return { x: depth, y: 0, z: 0 };
      }
    })();

    const partId = addExtrude(plane, origin, segments, direction);
    if (partId) {
      select(partId);
    }
    exitSketchMode();
    setShowExtrudeDialog(false);
  }

  function handleCancel() {
    exitSketchMode();
  }

  return (
    <div className="fixed left-1/2 bottom-6 z-30 -translate-x-1/2">
      <div className="relative flex items-center gap-1 rounded-xl border border-border bg-card/80 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
        {/* Drawing tools */}
        {TOOLS.map(({ tool: t, icon: Icon, label }) => (
          <Tooltip key={t} content={label}>
            <Button
              variant={tool === t && !isConstraintMode ? "default" : "ghost"}
              size="icon-sm"
              onClick={() => {
                clearSelection();
                setTool(t);
              }}
            >
              <Icon size={16} />
            </Button>
          </Tooltip>
        ))}

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Constraint tools */}
        {CONSTRAINT_TOOLS.map(({ tool: ct, icon: Icon, label, requires }) => (
          <Tooltip key={ct} content={`${label} (select ${requires} segment${requires > 1 ? "s" : ""})`}>
            <Button
              variant={constraintTool === ct ? "default" : "ghost"}
              size="icon-sm"
              onClick={() => handleConstraintToolClick(ct)}
              disabled={!hasSegments}
            >
              <Icon size={16} />
            </Button>
          </Tooltip>
        ))}

        {/* Apply constraint button (shows when ready) */}
        {isConstraintMode && canApplyConstraint && (
          <Tooltip content="Apply constraint">
            <Button
              variant="default"
              size="icon-sm"
              onClick={handleApplyConstraint}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play size={16} weight="fill" />
            </Button>
          </Tooltip>
        )}

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Solve */}
        <Tooltip content="Solve constraints">
          <Button
            variant={!solved ? "default" : "ghost"}
            size="icon-sm"
            onClick={solveSketch}
            disabled={!hasConstraints}
            className={!solved ? "bg-amber-600 hover:bg-amber-700" : ""}
          >
            <Play size={16} />
          </Button>
        </Tooltip>

        {/* Clear */}
        <Tooltip content="Clear sketch">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearSketch}
            disabled={!hasSegments}
          >
            <Trash size={16} />
          </Button>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Extrude */}
        <Tooltip content="Extrude sketch">
          <Button
            variant={hasSegments ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setShowExtrudeDialog(true)}
            disabled={!hasSegments}
          >
            <ArrowUp size={16} />
          </Button>
        </Tooltip>

        {/* Cancel */}
        <Tooltip content="Cancel sketch (Esc)">
          <Button variant="ghost" size="icon-sm" onClick={handleCancel}>
            <X size={16} />
          </Button>
        </Tooltip>

        {/* Extrude dialog */}
        {showExtrudeDialog && (
          <ExtrudeDialog
            onExtrude={handleExtrude}
            onClose={() => setShowExtrudeDialog(false)}
          />
        )}

        {/* Length dialog */}
        {showLengthDialog && (
          <NumberInputDialog
            label="Length"
            unit="mm"
            defaultValue={10}
            onSubmit={(len) => {
              applyLength(len);
              setShowLengthDialog(false);
            }}
            onClose={() => setShowLengthDialog(false)}
          />
        )}
      </div>
    </div>
  );
}
