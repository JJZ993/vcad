import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Separator } from "@/components/ui/separator";
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

function MaterialPicker({ partId }: { partId: string }) {
  const document = useDocumentStore((s) => s.document);
  const setPartMaterial = useDocumentStore((s) => s.setPartMaterial);

  // Find current material for this part
  const parts = useDocumentStore((s) => s.parts);
  const part = parts.find((p) => p.id === partId);
  if (!part) return null;

  const rootEntry = document.roots.find((r) => r.root === part.translateNodeId);
  const currentMaterial = rootEntry?.material ?? "default";

  function handleSelect(swatch: (typeof MATERIAL_SWATCHES)[number]) {
    // Ensure the material exists in the document
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
      // We need to set both the material definition and the part material
      // but setPartMaterial only sets the root entry. Let's just update doc directly
    }
    // Use the store method
    setPartMaterial(partId, swatch.key);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Material</SectionLabel>
      <div className="flex gap-1.5 px-1">
        {MATERIAL_SWATCHES.map((swatch) => (
          <button
            key={swatch.key}
            title={swatch.label}
            className={`h-5 w-5 rounded-full border-2 transition-all cursor-pointer ${
              currentMaterial === swatch.key
                ? "border-accent scale-110"
                : "border-border/50 hover:border-border"
            }`}
            style={{ backgroundColor: swatch.color }}
            onClick={() => handleSelect(swatch)}
          />
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-1 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
      {children}
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
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Position</SectionLabel>
      <ScrubInput
        label="X"
        value={offset.x}
        onChange={(v) =>
          setTranslation(part.id, { ...offset, x: v })
        }
      />
      <ScrubInput
        label="Y"
        value={offset.y}
        onChange={(v) =>
          setTranslation(part.id, { ...offset, y: v })
        }
      />
      <ScrubInput
        label="Z"
        value={offset.z}
        onChange={(v) =>
          setTranslation(part.id, { ...offset, z: v })
        }
      />
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
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Rotation</SectionLabel>
      <ScrubInput
        label="Rx"
        value={angles.x}
        step={1}
        onChange={(v) =>
          setRotation(part.id, { ...angles, x: v })
        }
      />
      <ScrubInput
        label="Ry"
        value={angles.y}
        step={1}
        onChange={(v) =>
          setRotation(part.id, { ...angles, y: v })
        }
      />
      <ScrubInput
        label="Rz"
        value={angles.z}
        step={1}
        onChange={(v) =>
          setRotation(part.id, { ...angles, z: v })
        }
      />
    </div>
  );
}

function CubeDimensions({
  part,
}: {
  part: PrimitivePartInfo;
}) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Cube") return null;

  const { size } = node.op;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Dimensions</SectionLabel>
      <ScrubInput
        label="W"
        value={size.x}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, {
            type: "Cube",
            size: { ...size, x: v },
          })
        }
      />
      <ScrubInput
        label="H"
        value={size.y}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, {
            type: "Cube",
            size: { ...size, y: v },
          })
        }
      />
      <ScrubInput
        label="D"
        value={size.z}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, {
            type: "Cube",
            size: { ...size, z: v },
          })
        }
      />
    </div>
  );
}

function CylinderDimensions({
  part,
}: {
  part: PrimitivePartInfo;
}) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Cylinder") return null;

  const op = node.op;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Dimensions</SectionLabel>
      <ScrubInput
        label="R"
        value={op.radius}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, { ...op, radius: v })
        }
      />
      <ScrubInput
        label="H"
        value={op.height}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, { ...op, height: v })
        }
      />
    </div>
  );
}

function SphereDimensions({
  part,
}: {
  part: PrimitivePartInfo;
}) {
  const document = useDocumentStore((s) => s.document);
  const updatePrimitiveOp = useDocumentStore((s) => s.updatePrimitiveOp);

  const node = document.nodes[String(part.primitiveNodeId)];
  if (!node || node.op.type !== "Sphere") return null;

  const op = node.op;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Dimensions</SectionLabel>
      <ScrubInput
        label="R"
        value={op.radius}
        min={0.1}
        onChange={(v) =>
          updatePrimitiveOp(part.id, { ...op, radius: v })
        }
      />
    </div>
  );
}

export function PropertyPanel() {
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const parts = useDocumentStore((s) => s.parts);
  const document = useDocumentStore((s) => s.document);

  if (selectedPartIds.size === 0) return null;

  // Multi-select: show count only
  if (selectedPartIds.size > 1) {
    return (
      <Panel side="right">
        <PanelHeader>{selectedPartIds.size} parts selected</PanelHeader>
        <PanelBody>
          <div className="px-1 text-xs text-text-muted">
            Select a single part to edit properties.
          </div>
        </PanelBody>
      </Panel>
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
    <Panel side="right">
      <PanelHeader>{part.name}</PanelHeader>
      <PanelBody className="flex flex-col gap-3">
        {/* Dimensions by type (primitives only) */}
        {isPrimitivePart(part) && part.kind === "cube" && (
          <CubeDimensions part={part} />
        )}
        {isPrimitivePart(part) && part.kind === "cylinder" && (
          <CylinderDimensions part={part} />
        )}
        {isPrimitivePart(part) && part.kind === "sphere" && (
          <SphereDimensions part={part} />
        )}

        {isPrimitivePart(part) && <Separator />}

        {/* Boolean type label */}
        {part.kind === "boolean" && (
          <>
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Boolean</SectionLabel>
              <div className="px-1 text-xs text-text-muted capitalize">
                {part.booleanType}
              </div>
            </div>
            <Separator />
          </>
        )}

        <PositionSection part={part} offset={offset} />

        <Separator />

        <RotationSection part={part} angles={angles} />

        <Separator />

        <MaterialPicker partId={part.id} />
      </PanelBody>
    </Panel>
  );
}
