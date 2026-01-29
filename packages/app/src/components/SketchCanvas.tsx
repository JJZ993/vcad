import { useRef, useEffect, useCallback, useState } from "react";
import { useSketchStore, useUiStore, getSketchPlaneName } from "@vcad/core";
import { useTheme } from "@/hooks/useTheme";
import type { Vec2, SketchSegment2D } from "@vcad/ir";

const GRID_SIZE = 10; // mm
const SCALE = 10; // pixels per mm

/** Find the closest segment to a point, returning its index and distance. */
function findClosestSegment(
  pt: Vec2,
  segments: SketchSegment2D[],
): { index: number; distance: number } | null {
  if (segments.length === 0) return null;

  let closest = { index: 0, distance: Infinity };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    // For lines, compute distance to line segment
    if (seg.type === "Line") {
      const d = pointToSegmentDistance(pt, seg.start, seg.end);
      if (d < closest.distance) {
        closest = { index: i, distance: d };
      }
    } else {
      // For arcs, simplified: distance to center
      const d = Math.sqrt((pt.x - seg.center.x) ** 2 + (pt.y - seg.center.y) ** 2);
      const radius = Math.sqrt(
        (seg.start.x - seg.center.x) ** 2 + (seg.start.y - seg.center.y) ** 2,
      );
      const arcDist = Math.abs(d - radius);
      if (arcDist < closest.distance) {
        closest = { index: i, distance: arcDist };
      }
    }
  }

  return closest;
}

function pointToSegmentDistance(pt: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) {
    return Math.sqrt((pt.x - a.x) ** 2 + (pt.y - a.y) ** 2);
  }
  let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((pt.x - projX) ** 2 + (pt.y - projY) ** 2);
}

export function SketchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<Vec2 | null>(null);

  const active = useSketchStore((s) => s.active);
  const plane = useSketchStore((s) => s.plane);
  const segments = useSketchStore((s) => s.segments);
  const constraints = useSketchStore((s) => s.constraints);
  const tool = useSketchStore((s) => s.tool);
  const constraintTool = useSketchStore((s) => s.constraintTool);
  const points = useSketchStore((s) => s.points);
  const selectedSegments = useSketchStore((s) => s.selectedSegments);
  const solved = useSketchStore((s) => s.solved);
  const addPoint = useSketchStore((s) => s.addPoint);
  const finishShape = useSketchStore((s) => s.finishShape);
  const toggleSegmentSelection = useSketchStore((s) => s.toggleSegmentSelection);
  const gridSnap = useUiStore((s) => s.gridSnap);
  const { isDark } = useTheme();

  const isConstraintMode = constraintTool !== "none";

  const snap = useCallback(
    (pt: Vec2): Vec2 => {
      if (!gridSnap) return pt;
      return {
        x: Math.round(pt.x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(pt.y / GRID_SIZE) * GRID_SIZE,
      };
    },
    [gridSnap],
  );

  const canvasToSketch = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const x = (clientX - rect.left - cx) / SCALE;
      const y = -(clientY - rect.top - cy) / SCALE; // flip Y
      return snap({ x, y });
    },
    [snap],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setMousePos(canvasToSketch(e.clientX, e.clientY));
    },
    [canvasToSketch],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const pt = canvasToSketch(e.clientX, e.clientY);

      if (isConstraintMode) {
        // In constraint mode, select/deselect segments
        const closest = findClosestSegment(pt, segments);
        if (closest && closest.distance < 2) {
          // 2mm tolerance
          toggleSegmentSelection(closest.index);
        }
      } else {
        // Normal drawing mode
        addPoint(pt);
      }
    },
    [canvasToSketch, addPoint, isConstraintMode, segments, toggleSegmentSelection],
  );

  const handleDoubleClick = useCallback(() => {
    if (tool === "line") {
      finishShape();
    }
  }, [tool, finishShape]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const cx = width / 2;
    const cy = height / 2;

    // Clear
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    const gridExtent = 200; // mm
    for (let i = -gridExtent; i <= gridExtent; i += GRID_SIZE) {
      const px = cx + i * SCALE;
      const py = cy - i * SCALE;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.stroke();

    ctx.strokeStyle = "#22c55e";
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();

    // Origin
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw existing segments
    ctx.lineCap = "round";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const isSelected = selectedSegments.includes(i);
      const sx = cx + seg.start.x * SCALE;
      const sy = cy - seg.start.y * SCALE;
      const ex = cx + seg.end.x * SCALE;
      const ey = cy - seg.end.y * SCALE;

      // Style based on selection
      ctx.strokeStyle = isSelected ? "#f59e0b" : "#3b82f6";
      ctx.lineWidth = isSelected ? 3 : 2;

      ctx.beginPath();
      if (seg.type === "Line") {
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
      } else {
        // Arc
        const centerX = cx + seg.center.x * SCALE;
        const centerY = cy - seg.center.y * SCALE;
        const radius = Math.sqrt((sx - centerX) ** 2 + (sy - centerY) ** 2);
        const startAngle = Math.atan2(sy - centerY, sx - centerX);
        const endAngle = Math.atan2(ey - centerY, ex - centerX);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle, !seg.ccw);
      }
      ctx.stroke();

      // Draw vertices
      ctx.fillStyle = isSelected ? "#fbbf24" : isDark ? "#00d4ff" : "#0891b2";
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw constraint indicators
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    for (const constraint of constraints) {
      if (constraint.type === "Horizontal") {
        const seg = segments[constraint.line];
        if (seg?.type === "Line") {
          const mx = cx + ((seg.start.x + seg.end.x) / 2) * SCALE;
          const my = cy - ((seg.start.y + seg.end.y) / 2) * SCALE;
          ctx.fillStyle = "#22c55e";
          ctx.fillText("H", mx, my - 8);
        }
      } else if (constraint.type === "Vertical") {
        const seg = segments[constraint.line];
        if (seg?.type === "Line") {
          const mx = cx + ((seg.start.x + seg.end.x) / 2) * SCALE;
          const my = cy - ((seg.start.y + seg.end.y) / 2) * SCALE;
          ctx.fillStyle = "#22c55e";
          ctx.fillText("V", mx + 8, my);
        }
      } else if (constraint.type === "Length") {
        const seg = segments[constraint.line];
        if (seg?.type === "Line") {
          const mx = cx + ((seg.start.x + seg.end.x) / 2) * SCALE;
          const my = cy - ((seg.start.y + seg.end.y) / 2) * SCALE;
          ctx.fillStyle = "#a855f7";
          ctx.fillText(`${constraint.length}`, mx, my + 12);
        }
      } else if (constraint.type === "Parallel") {
        const segA = segments[constraint.lineA];
        const segB = segments[constraint.lineB];
        if (segA?.type === "Line" && segB?.type === "Line") {
          ctx.fillStyle = "#06b6d4";
          const mxA = cx + ((segA.start.x + segA.end.x) / 2) * SCALE;
          const myA = cy - ((segA.start.y + segA.end.y) / 2) * SCALE;
          const mxB = cx + ((segB.start.x + segB.end.x) / 2) * SCALE;
          const myB = cy - ((segB.start.y + segB.end.y) / 2) * SCALE;
          ctx.fillText("//", mxA, myA - 8);
          ctx.fillText("//", mxB, myB - 8);
        }
      } else if (constraint.type === "Perpendicular") {
        const segA = segments[constraint.lineA];
        if (segA?.type === "Line") {
          ctx.fillStyle = "#f43f5e";
          const mx = cx + ((segA.start.x + segA.end.x) / 2) * SCALE;
          const my = cy - ((segA.start.y + segA.end.y) / 2) * SCALE;
          ctx.fillText("⊥", mx, my - 8);
        }
      } else if (constraint.type === "EqualLength") {
        const segA = segments[constraint.lineA];
        const segB = segments[constraint.lineB];
        if (segA?.type === "Line" && segB?.type === "Line") {
          ctx.fillStyle = "#eab308";
          const mxA = cx + ((segA.start.x + segA.end.x) / 2) * SCALE;
          const myA = cy - ((segA.start.y + segA.end.y) / 2) * SCALE;
          const mxB = cx + ((segB.start.x + segB.end.x) / 2) * SCALE;
          const myB = cy - ((segB.start.y + segB.end.y) / 2) * SCALE;
          ctx.fillText("=", mxA, myA - 8);
          ctx.fillText("=", mxB, myB - 8);
        }
      }
    }

    // Draw preview shape
    if (mousePos) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
      ctx.fillStyle = "rgba(59, 130, 246, 0.1)";

      if (tool === "line" && points.length > 0) {
        const lastPt = points[points.length - 1]!;
        const lx = cx + lastPt.x * SCALE;
        const ly = cy - lastPt.y * SCALE;
        const mx = cx + mousePos.x * SCALE;
        const my = cy - mousePos.y * SCALE;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(mx, my);
        ctx.stroke();
      } else if (tool === "rectangle" && points.length === 1) {
        const p1 = points[0]!;
        const x1 = cx + Math.min(p1.x, mousePos.x) * SCALE;
        const y1 = cy - Math.max(p1.y, mousePos.y) * SCALE;
        const w = Math.abs(mousePos.x - p1.x) * SCALE;
        const h = Math.abs(mousePos.y - p1.y) * SCALE;
        ctx.beginPath();
        ctx.rect(x1, y1, w, h);
        ctx.fill();
        ctx.stroke();
      } else if (tool === "circle" && points.length === 1) {
        const center = points[0]!;
        const radius =
          Math.sqrt(
            (mousePos.x - center.x) ** 2 + (mousePos.y - center.y) ** 2,
          ) * SCALE;
        if (radius > 1) {
          ctx.beginPath();
          ctx.arc(cx + center.x * SCALE, cy - center.y * SCALE, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.setLineDash([]);

      // Cursor crosshair
      const mx = cx + mousePos.x * SCALE;
      const my = cy - mousePos.y * SCALE;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx - 10, my);
      ctx.lineTo(mx + 10, my);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx, my - 10);
      ctx.lineTo(mx, my + 10);
      ctx.stroke();

      // Coordinate display
      ctx.fillStyle = "white";
      ctx.font = "12px monospace";
      ctx.fillText(`${mousePos.x.toFixed(1)}, ${mousePos.y.toFixed(1)}`, mx + 15, my - 5);
    }

    // Draw pending points
    ctx.fillStyle = "#f59e0b";
    for (const pt of points) {
      ctx.beginPath();
      ctx.arc(cx + pt.x * SCALE, cy - pt.y * SCALE, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [active, segments, constraints, points, mousePos, tool, selectedSegments, isDark]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      // Trigger re-render
      setMousePos((m) => m);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-20">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => setMousePos(null)}
      />
      <div className="absolute left-4 top-4  bg-surface border border-border px-3 py-2 text-xs text-text">
        <span className="font-medium">Sketch Mode</span>
        <span className="ml-2 text-text-muted">Plane: {getSketchPlaneName(plane)}</span>
        {isConstraintMode && (
          <span className="ml-2 text-amber-400">
            Constraint: {constraintTool} ({selectedSegments.length} selected)
          </span>
        )}
        {!solved && (
          <span className="ml-2 text-red-400">Unsolved</span>
        )}
      </div>
    </div>
  );
}
