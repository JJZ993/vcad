import { useMemo } from "react";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";
import { useUiStore } from "@/stores/ui-store";
import { useDocumentStore } from "@/stores/document-store";
import { useEngineStore } from "@/stores/engine-store";
import { isPrimitivePart } from "@/types";

const DIM_COLOR = "#94a3b8"; // muted accent

interface DimensionLineProps {
  start: THREE.Vector3;
  end: THREE.Vector3;
  label: string;
  offset?: THREE.Vector3;
}

function DimensionLine({ start, end, label, offset = new THREE.Vector3() }: DimensionLineProps) {
  const mid = new THREE.Vector3().lerpVectors(start, end, 0.5).add(offset);
  const tickSize = 1;
  const dir = new THREE.Vector3().subVectors(end, start).normalize();

  // Perpendicular direction for ticks (in XZ plane for most cases)
  const up = new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3().crossVectors(dir, up).normalize();
  if (perp.length() < 0.1) {
    perp.set(1, 0, 0);
  }

  const startTick1 = start.clone().add(perp.clone().multiplyScalar(tickSize));
  const startTick2 = start.clone().add(perp.clone().multiplyScalar(-tickSize));
  const endTick1 = end.clone().add(perp.clone().multiplyScalar(tickSize));
  const endTick2 = end.clone().add(perp.clone().multiplyScalar(-tickSize));

  return (
    <>
      {/* Main dimension line */}
      <Line
        points={[start, end]}
        color={DIM_COLOR}
        lineWidth={1}
        transparent
        opacity={0.7}
      />
      {/* Start tick */}
      <Line
        points={[startTick1, startTick2]}
        color={DIM_COLOR}
        lineWidth={1}
        transparent
        opacity={0.7}
      />
      {/* End tick */}
      <Line
        points={[endTick1, endTick2]}
        color={DIM_COLOR}
        lineWidth={1}
        transparent
        opacity={0.7}
      />
      {/* Label */}
      <Html position={mid} center style={{ pointerEvents: "none" }}>
        <div className=" bg-surface border border-border px-1 py-0.5 text-[10px] text-text-muted whitespace-nowrap">
          {label}
        </div>
      </Html>
    </>
  );
}

export function DimensionOverlay() {
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const isDraggingGizmo = useUiStore((s) => s.isDraggingGizmo);
  const parts = useDocumentStore((s) => s.parts);
  const document = useDocumentStore((s) => s.document);
  const scene = useEngineStore((s) => s.scene);

  const dimensions = useMemo(() => {
    // Only show for single selected primitive
    if (selectedPartIds.size !== 1) return null;

    const partId = Array.from(selectedPartIds)[0]!;
    const part = parts.find((p) => p.id === partId);
    if (!part || !isPrimitivePart(part)) return null;

    const partIndex = parts.findIndex((p) => p.id === partId);
    const evalPart = scene?.parts[partIndex];
    if (!evalPart) return null;

    // Get primitive dimensions from document
    const primNode = document.nodes[String(part.primitiveNodeId)];
    if (!primNode) return null;

    // Get translation offset
    const translateNode = document.nodes[String(part.translateNodeId)];
    const offset =
      translateNode?.op.type === "Translate"
        ? translateNode.op.offset
        : { x: 0, y: 0, z: 0 };

    const center = new THREE.Vector3(offset.x, offset.y, offset.z);

    if (primNode.op.type === "Cube") {
      const { size } = primNode.op;
      const halfW = size.x / 2;
      const halfH = size.y / 2;
      const halfD = size.z / 2;

      return [
        // Width (X)
        {
          start: new THREE.Vector3(center.x - halfW, center.y - halfH - 3, center.z + halfD),
          end: new THREE.Vector3(center.x + halfW, center.y - halfH - 3, center.z + halfD),
          label: `${size.x.toFixed(1)} mm`,
        },
        // Height (Y)
        {
          start: new THREE.Vector3(center.x + halfW + 3, center.y - halfH, center.z + halfD),
          end: new THREE.Vector3(center.x + halfW + 3, center.y + halfH, center.z + halfD),
          label: `${size.y.toFixed(1)} mm`,
        },
        // Depth (Z)
        {
          start: new THREE.Vector3(center.x + halfW + 3, center.y - halfH - 3, center.z - halfD),
          end: new THREE.Vector3(center.x + halfW + 3, center.y - halfH - 3, center.z + halfD),
          label: `${size.z.toFixed(1)} mm`,
        },
      ];
    }

    if (primNode.op.type === "Cylinder") {
      const { radius, height } = primNode.op;
      const halfH = height / 2;

      return [
        // Radius
        {
          start: new THREE.Vector3(center.x, center.y - halfH - 3, center.z),
          end: new THREE.Vector3(center.x + radius, center.y - halfH - 3, center.z),
          label: `r=${radius.toFixed(1)} mm`,
        },
        // Height
        {
          start: new THREE.Vector3(center.x + radius + 3, center.y - halfH, center.z),
          end: new THREE.Vector3(center.x + radius + 3, center.y + halfH, center.z),
          label: `${height.toFixed(1)} mm`,
        },
      ];
    }

    if (primNode.op.type === "Sphere") {
      const { radius } = primNode.op;

      return [
        // Radius
        {
          start: new THREE.Vector3(center.x, center.y, center.z),
          end: new THREE.Vector3(center.x + radius, center.y, center.z),
          label: `r=${radius.toFixed(1)} mm`,
        },
      ];
    }

    return null;
  }, [selectedPartIds, parts, document, scene]);

  if (!dimensions || isDraggingGizmo) return null;

  return (
    <>
      {dimensions.map((dim, i) => (
        <DimensionLine
          key={i}
          start={dim.start}
          end={dim.end}
          label={dim.label}
        />
      ))}
    </>
  );
}
