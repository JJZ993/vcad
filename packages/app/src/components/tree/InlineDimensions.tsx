import { ScrubInput } from "@/components/ui/scrub-input";
import { useDocumentStore } from "@vcad/core";
import type { PrimitivePartInfo, SweepPartInfo } from "@vcad/core";

interface InlineCubeDimensionsProps {
  part: PrimitivePartInfo;
}

export function InlineCubeDimensions({ part }: InlineCubeDimensionsProps) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Cube") return null;

  const { size } = node.op;

  return (
    <div className="grid grid-cols-3 gap-1 px-2 pb-1">
      <ScrubInput
        label="W"
        tooltip="Width"
        value={size.x}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, { type: "Cube", size: { ...size, x: v } })
        }
        unit="mm"
        compact
      />
      <ScrubInput
        label="H"
        tooltip="Height"
        value={size.y}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, { type: "Cube", size: { ...size, y: v } })
        }
        unit="mm"
        compact
      />
      <ScrubInput
        label="D"
        tooltip="Depth"
        value={size.z}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, { type: "Cube", size: { ...size, z: v } })
        }
        unit="mm"
        compact
      />
    </div>
  );
}

interface InlineCylinderDimensionsProps {
  part: PrimitivePartInfo;
}

export function InlineCylinderDimensions({ part }: InlineCylinderDimensionsProps) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Cylinder") return null;

  const op = node.op;

  return (
    <div className="grid grid-cols-2 gap-1 px-2 pb-1">
      <ScrubInput
        label="R"
        tooltip="Radius"
        value={op.radius}
        min={0.1}
        onChange={(v) => updatePrimitiveOp(part.id, { ...op, radius: v })}
        unit="mm"
        compact
      />
      <ScrubInput
        label="H"
        tooltip="Height"
        value={op.height}
        min={0.1}
        onChange={(v) => updatePrimitiveOp(part.id, { ...op, height: v })}
        unit="mm"
        compact
      />
    </div>
  );
}

interface InlineSphereDimensionsProps {
  part: PrimitivePartInfo;
}

export function InlineSphereDimensions({ part }: InlineSphereDimensionsProps) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Sphere") return null;

  const op = node.op;

  return (
    <div className="grid grid-cols-1 gap-1 px-2 pb-1 max-w-[100px]">
      <ScrubInput
        label="R"
        tooltip="Radius"
        value={op.radius}
        min={0.1}
        onChange={(v) => updatePrimitiveOp(part.id, { ...op, radius: v })}
        unit="mm"
        compact
      />
    </div>
  );
}

interface InlineSweepPropertiesProps {
  part: SweepPartInfo;
}

export function InlineSweepProperties({ part }: InlineSweepPropertiesProps) {
  const document = useDocumentStore((s) => s.document);
  const updateSweepOp = useDocumentStore((s) => s.updateSweepOp);

  const node = document.nodes[String(part.sweepNodeId)];
  if (!node || node.op.type !== "Sweep") return null;

  const op = node.op;
  const helixPath = op.path.type === "Helix" ? op.path : null;

  return (
    <div className="space-y-2 px-2 pb-1">
      {/* Helix path parameters */}
      {helixPath && (
        <div className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">
            Helix
          </div>
          <div className="grid grid-cols-2 gap-1">
            <ScrubInput
              label="R"
              tooltip="Radius"
              value={helixPath.radius}
              min={0.1}
              step={0.5}
              onChange={(v) =>
                updateSweepOp(part.id, { path: { ...helixPath, radius: v } })
              }
              unit="mm"
              compact
            />
            <ScrubInput
              label="P"
              tooltip="Pitch"
              value={helixPath.pitch}
              min={0.1}
              step={0.5}
              onChange={(v) =>
                updateSweepOp(part.id, { path: { ...helixPath, pitch: v } })
              }
              unit="mm"
              compact
            />
            <ScrubInput
              label="H"
              tooltip="Height"
              value={helixPath.height}
              min={0.1}
              step={1}
              onChange={(v) =>
                updateSweepOp(part.id, { path: { ...helixPath, height: v } })
              }
              unit="mm"
              compact
            />
            <ScrubInput
              label="N"
              tooltip="Number of turns"
              value={helixPath.turns}
              min={0.25}
              step={0.25}
              onChange={(v) =>
                updateSweepOp(part.id, { path: { ...helixPath, turns: v } })
              }
              compact
            />
          </div>
        </div>
      )}

      {/* Orientation, Twist, Scale */}
      <div className="space-y-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">
          Profile
        </div>
        <div className="grid grid-cols-2 gap-1">
          <ScrubInput
            label="O"
            tooltip="Orientation"
            value={(op.orientation ?? 0) * (180 / Math.PI)}
            step={5}
            onChange={(v) =>
              updateSweepOp(part.id, { orientation: v * (Math.PI / 180) })
            }
            unit="°"
            compact
          />
          <ScrubInput
            label="T"
            tooltip="Twist"
            value={(op.twist_angle ?? 0) * (180 / Math.PI)}
            step={5}
            onChange={(v) =>
              updateSweepOp(part.id, { twist_angle: v * (Math.PI / 180) })
            }
            unit="°"
            compact
          />
          <ScrubInput
            label="S"
            tooltip="Scale start"
            value={op.scale_start ?? 1}
            min={0.1}
            step={0.1}
            onChange={(v) => updateSweepOp(part.id, { scale_start: v })}
            compact
          />
          <ScrubInput
            label="E"
            tooltip="Scale end"
            value={op.scale_end ?? 1}
            min={0.1}
            step={0.1}
            onChange={(v) => updateSweepOp(part.id, { scale_end: v })}
            compact
          />
        </div>
      </div>
    </div>
  );
}
