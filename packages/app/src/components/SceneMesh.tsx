import { useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { Edges, Html } from "@react-three/drei";
import type { TriangleMesh, PartInfo } from "@vcad/core";
import { useUiStore, useDocumentStore } from "@vcad/core";

const HOVER_EMISSIVE = new THREE.Color(0xffb800); // neon amber

interface SceneMeshProps {
  partInfo: PartInfo;
  mesh: TriangleMesh;
  selected: boolean;
}

export function SceneMesh({ partInfo, mesh, selected }: SceneMeshProps) {
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const showWireframe = useUiStore((s) => s.showWireframe);
  const hoveredPartId = useUiStore((s) => s.hoveredPartId);
  const setHoveredPartId = useUiStore((s) => s.setHoveredPartId);
  const document = useDocumentStore((s) => s.document);

  const isHovered = hoveredPartId === partInfo.id;

  // Resolve material color from document
  const materialColor = useMemo(() => {
    const rootEntry = document.roots.find(
      (r) => r.root === partInfo.translateNodeId,
    );
    const matKey = rootEntry?.material ?? "default";
    const mat = document.materials[matKey];
    if (mat) {
      return new THREE.Color(mat.color[0], mat.color[1], mat.color[2]);
    }
    return new THREE.Color(0.7, 0.7, 0.75);
  }, [document, partInfo.translateNodeId]);

  // Compute emissive state: selected > hovered > none
  const emissiveColor = useMemo(() => {
    if (selected) return materialColor.clone().multiplyScalar(0.3);
    if (isHovered) return HOVER_EMISSIVE;
    return undefined;
  }, [selected, isHovered, materialColor]);

  const emissiveIntensity = selected ? 0.2 : isHovered ? 0.08 : 0;

  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;

    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(mesh.positions, 3),
    );
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals();

    return () => {
      geo.dispose();
    };
  }, [mesh]);

  // Compute center for tooltip positioning
  const center = useMemo(() => {
    if (!mesh.positions.length) return new THREE.Vector3();
    const box = new THREE.Box3();
    const pos = new THREE.Vector3();
    for (let i = 0; i < mesh.positions.length; i += 3) {
      pos.set(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!);
      box.expandByPoint(pos);
    }
    const c = new THREE.Vector3();
    box.getCenter(c);
    // Offset above the center
    c.y = box.max.y + 3;
    return c;
  }, [mesh.positions]);

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.shiftKey) {
          toggleSelect(partInfo.id);
        } else {
          select(partInfo.id);
        }
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredPartId(partInfo.id);
      }}
      onPointerOut={() => {
        setHoveredPartId(null);
      }}
    >
      <bufferGeometry ref={geoRef} />
      <meshStandardMaterial
        color={materialColor}
        emissive={emissiveColor}
        emissiveIntensity={emissiveIntensity}
        metalness={0.1}
        roughness={0.6}
        flatShading={false}
        side={THREE.DoubleSide}
      />
      {showWireframe && <Edges threshold={15} color="#666" />}
      {isHovered && !selected && (
        <Html position={center} center style={{ pointerEvents: "none" }}>
          <div className=" bg-surface border border-border px-2 py-1 text-xs text-text shadow-lg whitespace-nowrap">
            {partInfo.name}
          </div>
        </Html>
      )}
    </mesh>
  );
}
