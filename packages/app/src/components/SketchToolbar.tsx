import { useState, useEffect } from "react";
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
  Plus,
  Spiral,
  Stack,
  Warning,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSketchStore, useDocumentStore, useUiStore, getSketchPlaneDirections } from "@vcad/core";
import { useToastStore } from "@/stores/toast-store";
import type { SketchState, ConstraintTool } from "@vcad/core";

/** Confirmation dialog for discarding sketch with segments */
function DiscardConfirmDialog({
  onDiscard,
  onKeepEditing,
}: {
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  return (
    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 border border-border bg-card p-4 shadow-2xl min-w-[240px]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-amber-500">
          <Warning size={18} weight="fill" />
          <span className="text-sm font-medium">Discard sketch?</span>
        </div>
        <p className="text-xs text-text-muted">
          You have unsaved geometry. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button variant="ghost" size="sm" className="flex-1" onClick={onKeepEditing}>
            Keep Editing
          </Button>
        </div>
      </div>
    </div>
  );
}

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
    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2  border border-border bg-card p-4 shadow-2xl">
      <div className="flex flex-col gap-3">
        <div className="text-xs font-medium text-text">{label}</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-24  border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
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

function SweepDialog({
  onSweep,
  onClose,
}: {
  onSweep: (params: { type: "line" | "helix"; height: number; radius?: number; turns?: number }) => void;
  onClose: () => void;
}) {
  const [pathType, setPathType] = useState<"line" | "helix">("line");
  const [height, setHeight] = useState(20);
  const [radius, setRadius] = useState(10);
  const [turns, setTurns] = useState(2);

  return (
    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2  border border-border bg-card p-4 shadow-2xl">
      <div className="flex flex-col gap-3">
        <div className="text-xs font-medium text-text">Sweep Path</div>
        <div className="flex gap-2">
          <button
            onClick={() => setPathType("line")}
            className={`px-3 py-1  text-xs ${pathType === "line" ? "bg-accent text-white" : "bg-surface text-text hover:bg-border/30"}`}
          >
            Line
          </button>
          <button
            onClick={() => setPathType("helix")}
            className={`px-3 py-1  text-xs ${pathType === "helix" ? "bg-accent text-white" : "bg-surface text-text hover:bg-border/30"}`}
          >
            Helix
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted w-12">Height</span>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="w-20  border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
          />
          <span className="text-xs text-text-muted">mm</span>
        </div>

        {pathType === "helix" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted w-12">Radius</span>
              <input
                type="number"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="w-20  border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
              />
              <span className="text-xs text-text-muted">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted w-12">Turns</span>
              <input
                type="number"
                value={turns}
                onChange={(e) => setTurns(Number(e.target.value))}
                className="w-20  border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
              />
            </div>
          </>
        )}

        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onSweep({ type: pathType, height, radius, turns })}
          >
            Create
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function LoftHeightDialog({
  onSetHeight,
  onClose,
  profileCount,
}: {
  onSetHeight: (height: number) => void;
  onClose: () => void;
  profileCount: number;
}) {
  return (
    <NumberInputDialog
      label={`Profile ${profileCount + 1} Z offset`}
      unit="mm"
      defaultValue={(profileCount + 1) * 10}
      onSubmit={onSetHeight}
      onClose={onClose}
    />
  );
}

export function SketchToolbar() {
  const [showExtrudeDialog, setShowExtrudeDialog] = useState(false);
  const [showLengthDialog, setShowLengthDialog] = useState(false);
  const [showSweepDialog, setShowSweepDialog] = useState(false);
  const [showLoftHeightDialog, setShowLoftHeightDialog] = useState(false);

  const active = useSketchStore((s) => s.active);
  const plane = useSketchStore((s) => s.plane);
  const origin = useSketchStore((s) => s.origin);
  const segments = useSketchStore((s) => s.segments);
  const constraints = useSketchStore((s) => s.constraints);
  const tool = useSketchStore((s) => s.tool);
  const constraintTool = useSketchStore((s) => s.constraintTool);
  const selectedSegments = useSketchStore((s) => s.selectedSegments);
  const constraintStatus = useSketchStore((s) => s.constraintStatus);
  const loftMode = useSketchStore((s) => s.loftMode);
  const profiles = useSketchStore((s) => s.profiles);
  const pendingExit = useSketchStore((s) => s.pendingExit);
  const setTool = useSketchStore((s) => s.setTool);
  const setConstraintTool = useSketchStore((s) => s.setConstraintTool);
  const exitSketchMode = useSketchStore((s) => s.exitSketchMode);
  const requestExit = useSketchStore((s) => s.requestExit);
  const confirmExit = useSketchStore((s) => s.confirmExit);
  const cancelExit = useSketchStore((s) => s.cancelExit);
  const clearSketch = useSketchStore((s) => s.clearSketch);
  const applyHorizontal = useSketchStore((s) => s.applyHorizontal);
  const applyVertical = useSketchStore((s) => s.applyVertical);
  const applyLength = useSketchStore((s) => s.applyLength);
  const applyParallel = useSketchStore((s) => s.applyParallel);
  const applyEqual = useSketchStore((s) => s.applyEqual);
  const solveSketch = useSketchStore((s) => s.solveSketch);
  const clearSelection = useSketchStore((s) => s.clearSelection);
  const saveProfile = useSketchStore((s) => s.saveProfile);
  const clearForNextProfile = useSketchStore((s) => s.clearForNextProfile);
  const exitLoftMode = useSketchStore((s) => s.exitLoftMode);

  const addExtrude = useDocumentStore((s) => s.addExtrude);
  const addSweep = useDocumentStore((s) => s.addSweep);
  const addLoft = useDocumentStore((s) => s.addLoft);
  const select = useUiStore((s) => s.select);
  const addToast = useToastStore((s) => s.addToast);

  // Listen for quick extrude keyboard shortcut
  useEffect(() => {
    const handleQuickExtrude = () => {
      if (active && segments.length > 0 && !loftMode) {
        setShowExtrudeDialog(true);
      }
    };
    window.addEventListener("vcad:sketch-extrude", handleQuickExtrude);
    return () => window.removeEventListener("vcad:sketch-extrude", handleQuickExtrude);
  }, [active, segments.length, loftMode]);

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

    // Determine extrusion direction based on plane normal
    const { normal } = getSketchPlaneDirections(plane);
    const direction = {
      x: normal.x * depth,
      y: normal.y * depth,
      z: normal.z * depth,
    };

    const partId = addExtrude(plane, origin, segments, direction);
    if (partId) {
      select(partId);
      addToast("Created Extrude", "success");
    }
    exitSketchMode();
    setShowExtrudeDialog(false);
  }

  function handleSweep(params: { type: "line" | "helix"; height: number; radius?: number; turns?: number }) {
    if (!hasSegments) return;

    // Create path based on type
    const { normal } = getSketchPlaneDirections(plane);
    const path = (() => {
      if (params.type === "line") {
        // Line path along the normal direction of the sketch plane
        const start = origin;
        const end = {
          x: origin.x + normal.x * params.height,
          y: origin.y + normal.y * params.height,
          z: origin.z + normal.z * params.height,
        };
        return { type: "Line" as const, start, end };
      } else {
        // Helix path
        return {
          type: "Helix" as const,
          radius: params.radius ?? 10,
          pitch: params.height / (params.turns ?? 2),
          height: params.height,
          turns: params.turns ?? 2,
        };
      }
    })();

    const partId = addSweep(plane, origin, segments, path);
    if (partId) {
      select(partId);
      addToast("Created Sweep", "success");
    }
    exitSketchMode();
    setShowSweepDialog(false);
  }

  function handleAddProfile(zOffset: number) {
    // Save current profile and prepare for next
    saveProfile();

    // Calculate new origin with offset along plane normal
    const { normal } = getSketchPlaneDirections(plane);
    const newOrigin = {
      x: origin.x + normal.x * zOffset,
      y: origin.y + normal.y * zOffset,
      z: origin.z + normal.z * zOffset,
    };

    clearForNextProfile(newOrigin);
    setShowLoftHeightDialog(false);
  }

  function handleCreateLoft() {
    const allProfiles = exitLoftMode();
    if (allProfiles && allProfiles.length >= 2) {
      const partId = addLoft(
        allProfiles.map((p) => ({
          plane: p.plane,
          origin: p.origin,
          segments: p.segments,
        })),
      );
      if (partId) {
        select(partId);
        addToast("Created Loft", "success");
      }
    }
  }

  function handleCancel() {
    if (loftMode) {
      exitLoftMode();
      addToast("Sketch cancelled", "info");
    } else {
      // Use requestExit to check if confirmation is needed
      const exited = requestExit();
      if (exited) {
        addToast("Sketch cancelled", "info");
      }
      // If not exited, pendingExit will be set and confirmation dialog will show
    }
  }

  function handleDiscardSketch() {
    confirmExit();
    addToast("Sketch discarded", "info");
  }

  function handleKeepEditing() {
    cancelExit();
  }

  return (
    <div className="fixed left-1/2 bottom-6 z-30 -translate-x-1/2">
      <div className="relative flex items-center gap-1  border border-border bg-card px-2 py-1.5 shadow-2xl">
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

        {/* Constraint status indicator */}
        {hasSegments && (
          <Tooltip
            content={
              constraintStatus === "under"
                ? "Under-constrained (add more constraints)"
                : constraintStatus === "solved"
                  ? "Fully constrained"
                  : constraintStatus === "over"
                    ? "Over-constrained (remove constraints)"
                    : "Constraints conflict"
            }
          >
            <div className="flex items-center gap-1.5 px-1">
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  constraintStatus === "under" && "bg-yellow-500",
                  constraintStatus === "solved" && "bg-green-500",
                  constraintStatus === "over" && "bg-orange-500",
                  constraintStatus === "error" && "bg-red-500"
                )}
              />
              <span
                className={cn(
                  "text-xs",
                  constraintStatus === "under" && "text-yellow-500",
                  constraintStatus === "solved" && "text-green-500",
                  constraintStatus === "over" && "text-orange-500",
                  constraintStatus === "error" && "text-red-500"
                )}
              >
                {constraints.length}
              </span>
            </div>
          </Tooltip>
        )}

        {/* Solve */}
        <Tooltip content="Solve constraints">
          <Button
            variant={constraintStatus === "error" ? "default" : "ghost"}
            size="icon-sm"
            onClick={solveSketch}
            disabled={!hasConstraints}
            className={cn(
              constraintStatus === "error" && "bg-amber-600 hover:bg-amber-700"
            )}
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

        {/* Loft mode indicator and controls */}
        {loftMode && (
          <>
            <div className="px-2 text-xs text-accent font-medium">
              Profile {profiles.length + (hasSegments ? 1 : 0)}
            </div>

            {/* Add Profile button */}
            <Tooltip content="Save profile & add next">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowLoftHeightDialog(true)}
                disabled={!hasSegments}
              >
                <Plus size={16} />
              </Button>
            </Tooltip>

            {/* Create Loft button */}
            <Tooltip content="Create Loft">
              <Button
                variant={profiles.length >= 1 && hasSegments ? "default" : "ghost"}
                size="icon-sm"
                onClick={handleCreateLoft}
                disabled={profiles.length < 1 || !hasSegments}
                className={profiles.length >= 1 && hasSegments ? "bg-green-600 hover:bg-green-700" : ""}
              >
                <Stack size={16} />
              </Button>
            </Tooltip>

            <Separator orientation="vertical" className="mx-1 h-5" />
          </>
        )}

        {/* Normal sketch mode buttons */}
        {!loftMode && (
          <>
            {/* Extrude */}
            <Tooltip content="Extrude sketch (E)">
              <Button
                variant={hasSegments ? "default" : "ghost"}
                size="icon-sm"
                onClick={() => setShowExtrudeDialog(true)}
                disabled={!hasSegments}
              >
                <ArrowUp size={16} />
              </Button>
            </Tooltip>

            {/* Sweep */}
            <Tooltip content="Sweep sketch">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowSweepDialog(true)}
                disabled={!hasSegments}
              >
                <Spiral size={16} />
              </Button>
            </Tooltip>
          </>
        )}

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

        {/* Sweep dialog */}
        {showSweepDialog && (
          <SweepDialog
            onSweep={handleSweep}
            onClose={() => setShowSweepDialog(false)}
          />
        )}

        {/* Loft height dialog */}
        {showLoftHeightDialog && (
          <LoftHeightDialog
            onSetHeight={handleAddProfile}
            onClose={() => setShowLoftHeightDialog(false)}
            profileCount={profiles.length}
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

        {/* Discard confirmation dialog */}
        {pendingExit && (
          <DiscardConfirmDialog
            onDiscard={handleDiscardSketch}
            onKeepEditing={handleKeepEditing}
          />
        )}
      </div>
    </div>
  );
}
