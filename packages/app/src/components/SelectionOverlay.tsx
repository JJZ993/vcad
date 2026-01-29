import { useMemo } from "react";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";
import { useUiStore, useDocumentStore, useEngineStore } from "@vcad/core";
import { useTheme } from "@/hooks/useTheme";

const ACCENT_DARK = "#00d4ff";
const ACCENT_LIGHT = "#0891b2"; // darker cyan for light mode contrast

const MODE_LABELS: Record<string, string> = {
  translate: "move",
  rotate: "rotate",
  scale: "scale",
};

function BoundingBoxLines({ box, color }: { box: THREE.Box3; color: string }) {
  const min = box.min;
  const max = box.max;

  // 12 edges of a box as line segments
  const edges: [THREE.Vector3, THREE.Vector3][] = [
    // Bottom face
    [new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z)],
    [new THREE.Vector3(max.x, min.y, min.z), new THREE.Vector3(max.x, min.y, max.z)],
    [new THREE.Vector3(max.x, min.y, max.z), new THREE.Vector3(min.x, min.y, max.z)],
    [new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(min.x, min.y, min.z)],
    // Top face
    [new THREE.Vector3(min.x, max.y, min.z), new THREE.Vector3(max.x, max.y, min.z)],
    [new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(max.x, max.y, max.z)],
    [new THREE.Vector3(max.x, max.y, max.z), new THREE.Vector3(min.x, max.y, max.z)],
    [new THREE.Vector3(min.x, max.y, max.z), new THREE.Vector3(min.x, max.y, min.z)],
    // Vertical edges
    [new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(min.x, max.y, min.z)],
    [new THREE.Vector3(max.x, min.y, min.z), new THREE.Vector3(max.x, max.y, min.z)],
    [new THREE.Vector3(max.x, min.y, max.z), new THREE.Vector3(max.x, max.y, max.z)],
    [new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(min.x, max.y, max.z)],
  ];

  return (
    <>
      {edges.map((edge, i) => (
        <Line
          key={i}
          points={edge}
          color={color}
          lineWidth={1}
          dashed
          dashSize={2}
          gapSize={1}
          transparent
          opacity={0.8}
        />
      ))}
    </>
  );
}

export function SelectionOverlay() {
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const transformMode = useUiStore((s) => s.transformMode);
  const isDraggingGizmo = useUiStore((s) => s.isDraggingGizmo);
  const parts = useDocumentStore((s) => s.parts);
  const scene = useEngineStore((s) => s.scene);
  const { isDark } = useTheme();

  const accentColor = isDark ? ACCENT_DARK : ACCENT_LIGHT;

  // Compute combined bounding box for all selected parts
  const { box, labelPosition } = useMemo(() => {
    if (selectedPartIds.size === 0 || !scene) {
      return { box: null, labelPosition: null };
    }

    const combinedBox = new THREE.Box3();
    let hasValidBox = false;

    selectedPartIds.forEach((partId) => {
      const partIndex = parts.findIndex((p) => p.id === partId);
      if (partIndex === -1) return;

      const evalPart = scene.parts[partIndex];
      if (!evalPart) return;

      const mesh = evalPart.mesh;
      if (!mesh.positions.length) return;

      const partBox = new THREE.Box3();
      const pos = new THREE.Vector3();
      for (let i = 0; i < mesh.positions.length; i += 3) {
        pos.set(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!);
        partBox.expandByPoint(pos);
      }

      combinedBox.union(partBox);
      hasValidBox = true;
    });

    if (!hasValidBox) {
      return { box: null, labelPosition: null };
    }

    // Label position: top-right corner, slightly offset
    const labelPos = new THREE.Vector3(
      combinedBox.max.x + 2,
      combinedBox.max.y + 2,
      combinedBox.max.z,
    );

    return { box: combinedBox, labelPosition: labelPos };
  }, [selectedPartIds, parts, scene]);

  if (!box || isDraggingGizmo) return null;

  return (
    <>
      {/* Dashed wireframe bounding box */}
      <BoundingBoxLines box={box} color={accentColor} />

      {/* Corner handles (small spheres) */}
      <mesh position={[box.min.x, box.min.y, box.min.z]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.6} />
      </mesh>
      <mesh position={[box.max.x, box.max.y, box.max.z]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.6} />
      </mesh>

      {/* Mode label */}
      {labelPosition && (
        <Html position={labelPosition} center style={{ pointerEvents: "none" }}>
          <div className=" bg-accent/90 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap">
            {MODE_LABELS[transformMode]}
          </div>
        </Html>
      )}
    </>
  );
}
