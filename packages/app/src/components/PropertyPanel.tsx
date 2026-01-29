import { Tooltip } from "@/components/ui/tooltip";
import { ScrubInput } from "@/components/ui/scrub-input";
import { useDocumentStore, useUiStore, isPrimitivePart } from "@vcad/core";
import type { PartInfo, PrimitivePartInfo } from "@vcad/core";
import type { Vec3 } from "@vcad/ir";

const MATERIAL_SWATCHES = [
  { key: "default", label: "Default", color: "#b3b3bf" },
  { key: "red", label: "Red", color: "#ef4444" },
  { key: "blue", label: "Blue", color: "#3b82f6" },
  { key: "green", label: "Green", color: "#22c55e" },
  { key: "orange", label: "Orange", color: "#f97316" },
  { key: "purple", label: "Purple", color: "#a855f7" },
];

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function SectionHeader({ children, tooltip }: { children: string; tooltip?: string }) {
  const content = (
    <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted pt-2 pb-1">
      {children}
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip content={tooltip} side="left">
        <div className="cursor-help">{content}</div>
      </Tooltip>
    );
  }
  return content;
}

function PartTypeBadge({ kind }: { kind: string }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 bg-card border border-border text-text-muted uppercase tracking-wide">
      {kind}
    </span>
  );
}

function MaterialPicker({ partId }: { partId: string }) {
  const document = useDocumentStore((s) => s.document);
  const setPartMaterial = useDocumentStore((s) => s.setPartMaterial);
  const parts = useDocumentStore((s) => s.parts);
  const part = parts.find((p) => p.id === partId);
  if (!part) return null;

  const rootEntry = document.roots.find((r) => r.root === part.translateNodeId);
  const currentMaterial = rootEntry?.material ?? "default";

  function handleSelect(swatch: (typeof MATERIAL_SWATCHES)[number]) {
    const state = useDocumentStore.getState();
    const newDoc = structuredClone(state.document);
    if (!newDoc.materials[swatch.key]) {
      const rgb = hexToRgb(swatch.color);
      newDoc.materials[swatch.key] = {
        name: swatch.label,
        color: rgb,
        metallic: 0.1,
        roughness: 0.6,
      };
    }
    setPartMaterial(partId, swatch.key);
  }

  return (
    <div>
      <SectionHeader tooltip="Assign a material color to this part">Material</SectionHeader>
      <div className="flex gap-1.5">
        {MATERIAL_SWATCHES.map((swatch) => (
          <Tooltip key={swatch.key} content={swatch.label} side="bottom">
            <button
              className={`h-5 w-5 rounded-full border-2 transition-all cursor-pointer ${
                currentMaterial === swatch.key
                  ? "border-accent scale-110"
                  : "border-transparent hover:border-border"
              }`}
              style={{ backgroundColor: swatch.color }}
              onClick={() => handleSelect(swatch)}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function PositionSection({
  part,
  offset,
}: {
  part: PartInfo;
  offset: Vec3;
}) {
  const setTranslation = useDocumentStore((s) => s.setTranslation);

  return (
    <div>
      <SectionHeader tooltip="Position offset from origin (mm)">Position</SectionHeader>
      <div className="space-y-0.5">
        <ScrubInput
          label="X"
          value={offset.x}
          onChange={(v) => setTranslation(part.id, { ...offset, x: v })}
        />
        <ScrubInput
          label="Y"
          value={offset.y}
          onChange={(v) => setTranslation(part.id, { ...offset, y: v })}
        />
        <ScrubInput
          label="Z"
          value={offset.z}
          onChange={(v) => setTranslation(part.id, { ...offset, z: v })}
        />
      </div>
    </div>
  );
}

function RotationSection({
  part,
  angles,
}: {
  part: PartInfo;
  angles: Vec3;
}) {
  const setRotation = useDocumentStore((s) => s.setRotation);

  return (
    <div>
      <SectionHeader tooltip="Rotation angles around each axis (degrees)">Rotation</SectionHeader>
      <div className="space-y-0.5">
        <ScrubInput
          label="X"
          value={angles.x}
          step={1}
          onChange={(v) => setRotation(part.id, { ...angles, x: v })}
        />
        <ScrubInput
          label="Y"
          value={angles.y}
          step={1}
          onChange={(v) => setRotation(part.id, { ...angles, y: v })}
        />
        <ScrubInput
          label="Z"
          value={angles.z}
          step={1}
          onChange={(v) => setRotation(part.id, { ...angles, z: v })}
        />
      </div>
    </div>
  );
}

function CubeDimensions({ part }: { part: PrimitivePartInfo }) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Cube") return null;

  const { size } = node.op;

  return (
    <div>
      <SectionHeader tooltip="Width, height, and depth of the box (mm)">Dimensions</SectionHeader>
      <div className="space-y-0.5">
        <ScrubInput
          label="W"
          value={size.x}
          min={0.1}
          onChange={(v) =>
            updatePrimitiveOp(part.id, { type: "Cube", size: { ...size, x: v } })
          }
        />
        <ScrubInput
          label="H"
          value={size.y}
          min={0.1}
          onChange={(v) =>
            updatePrimitiveOp(part.id, { type: "Cube", size: { ...size, y: v } })
          }
        />
        <ScrubInput
          label="D"
          value={size.z}
          min={0.1}
          onChange={(v) =>
            updatePrimitiveOp(part.id, { type: "Cube", size: { ...size, z: v } })
          }
        />
      </div>
    </div>
  );
}

function CylinderDimensions({ part }: { part: PrimitivePartInfo }) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Cylinder") return null;

  const op = node.op;

  return (
    <div>
      <SectionHeader tooltip="Radius and height of the cylinder (mm)">Dimensions</SectionHeader>
      <div className="space-y-0.5">
        <ScrubInput
          label="R"
          value={op.radius}
          min={0.1}
          onChange={(v) => updatePrimitiveOp(part.id, { ...op, radius: v })}
        />
        <ScrubInput
          label="H"
          value={op.height}
          min={0.1}
          onChange={(v) => updatePrimitiveOp(part.id, { ...op, height: v })}
        />
      </div>
    </div>
  );
}

function SphereDimensions({ part }: { part: PrimitivePartInfo }) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Sphere") return null;

  const op = node.op;

  return (
    <div>
      <SectionHeader tooltip="Radius of the sphere (mm)">Dimensions</SectionHeader>
      <div className="space-y-0.5">
        <ScrubInput
          label="R"
          value={op.radius}
          min={0.1}
          onChange={(v) => updatePrimitiveOp(part.id, { ...op, radius: v })}
        />
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border my-2" />;
}

function PropertyPanelContent() {
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const parts = useDocumentStore((s) => s.parts);
  const document = useDocumentStore((s) => s.document);

  if (selectedPartIds.size === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <div className="text-xs text-text-muted text-center">
          Select a part to edit properties
        </div>
      </div>
    );
  }

  if (selectedPartIds.size > 1) {
    return (
      <div className="p-3">
        <div className="text-xs font-medium text-text mb-1">
          {selectedPartIds.size} parts selected
        </div>
        <div className="text-[10px] text-text-muted">
          Select a single part to edit properties
        </div>
      </div>
    );
  }

  const singleId = Array.from(selectedPartIds)[0]!;
  const part = parts.find((p) => p.id === singleId);
  if (!part) return null;

  const translateNode = document.nodes[String(part.translateNodeId)];
  const rotateNode = document.nodes[String(part.rotateNodeId)];

  const offset =
    translateNode?.op.type === "Translate"
      ? translateNode.op.offset
      : { x: 0, y: 0, z: 0 };

  const angles =
    rotateNode?.op.type === "Rotate"
      ? rotateNode.op.angles
      : { x: 0, y: 0, z: 0 };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      {/* Header with name and type */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-text truncate flex-1">
            {part.name}
          </div>
          <PartTypeBadge kind={part.kind} />
        </div>
      </div>

      {/* Properties */}
      <div className="p-3 space-y-1">
        {/* Dimensions by type (primitives only) */}
        {isPrimitivePart(part) && part.kind === "cube" && (
          <>
            <CubeDimensions part={part} />
            <Divider />
          </>
        )}
        {isPrimitivePart(part) && part.kind === "cylinder" && (
          <>
            <CylinderDimensions part={part} />
            <Divider />
          </>
        )}
        {isPrimitivePart(part) && part.kind === "sphere" && (
          <>
            <SphereDimensions part={part} />
            <Divider />
          </>
        )}

        {/* Boolean type info */}
        {part.kind === "boolean" && (
          <>
            <div>
              <SectionHeader>Operation</SectionHeader>
              <div className="text-xs text-text capitalize">{part.booleanType}</div>
            </div>
            <Divider />
          </>
        )}

        <PositionSection part={part} offset={offset} />
        <Divider />
        <RotationSection part={part} angles={angles} />
        <Divider />
        <MaterialPicker partId={part.id} />
      </div>
    </div>
  );
}

export function PropertyPanel() {
  return <PropertyPanelContent />;
}
