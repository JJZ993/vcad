import { useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { Edges, Html } from "@react-three/drei";
import type { TriangleMesh, PartInfo, FaceInfo } from "@vcad/core";
import { useUiStore, useDocumentStore, useSketchStore } from "@vcad/core";
import type { ThreeEvent } from "@react-three/fiber";

const HOVER_EMISSIVE = new THREE.Color(0xffb800); // neon amber
const FACE_SELECT_EMISSIVE = new THREE.Color(0x00d4ff); // cyan for face selection

interface SceneMeshProps {
  partInfo: PartInfo;
  mesh: TriangleMesh;
  selected: boolean;
}

/** Compute face info from a raycast hit */
function computeFaceInfo(
  mesh: TriangleMesh,
  faceIndex: number,
  partId: string,
  hitPoint: THREE.Vector3
): FaceInfo {
  // Get triangle vertices from mesh indices
  const i0 = mesh.indices[faceIndex * 3]!;
  const i1 = mesh.indices[faceIndex * 3 + 1]!;
  const i2 = mesh.indices[faceIndex * 3 + 2]!;

  const v0 = new THREE.Vector3(
    mesh.positions[i0 * 3]!,
    mesh.positions[i0 * 3 + 1]!,
    mesh.positions[i0 * 3 + 2]!
  );
  const v1 = new THREE.Vector3(
    mesh.positions[i1 * 3]!,
    mesh.positions[i1 * 3 + 1]!,
    mesh.positions[i1 * 3 + 2]!
  );
  const v2 = new THREE.Vector3(
    mesh.positions[i2 * 3]!,
    mesh.positions[i2 * 3 + 1]!,
    mesh.positions[i2 * 3 + 2]!
  );

  // Compute face normal via cross product
  const edge1 = v1.clone().sub(v0);
  const edge2 = v2.clone().sub(v0);
  const normal = edge1.cross(edge2).normalize();

  return {
    partId,
    faceIndex,
    normal: { x: normal.x, y: normal.y, z: normal.z },
    centroid: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
  };
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

  // Face selection state
  const faceSelectionMode = useSketchStore((s) => s.faceSelectionMode);
  const hoveredFace = useSketchStore((s) => s.hoveredFace);
  const setHoveredFace = useSketchStore((s) => s.setHoveredFace);
  const selectFace = useSketchStore((s) => s.selectFace);

  const isHovered = hoveredPartId === partInfo.id;
  const isHoveredFace = faceSelectionMode && hoveredFace?.partId === partInfo.id;

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

  // Compute emissive state: face selection mode > selected > hovered > none
  const emissiveColor = useMemo(() => {
    if (isHoveredFace) return FACE_SELECT_EMISSIVE;
    if (selected) return materialColor.clone().multiplyScalar(0.3);
    if (isHovered) return HOVER_EMISSIVE;
    return undefined;
  }, [selected, isHovered, isHoveredFace, materialColor]);

  const emissiveIntensity = isHoveredFace ? 0.15 : selected ? 0.2 : isHovered ? 0.08 : 0;

  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;

    // Clone arrays to avoid issues with transferred/shared buffers
    const positions = new Float32Array(mesh.positions);
    const indices = new Uint32Array(mesh.indices);

    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

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

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();

    // In face selection mode, select the face
    if (faceSelectionMode && e.faceIndex != null) {
      const faceInfo = computeFaceInfo(mesh, e.faceIndex, partInfo.id, e.point);
      selectFace(faceInfo);
      return;
    }

    // Normal click behavior
    if (e.nativeEvent.shiftKey) {
      toggleSelect(partInfo.id);
    } else {
      select(partInfo.id);
    }
  }, [faceSelectionMode, mesh, partInfo.id, selectFace, toggleSelect, select]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (faceSelectionMode && e.faceIndex != null) {
      e.stopPropagation();
      const faceInfo = computeFaceInfo(mesh, e.faceIndex, partInfo.id, e.point);
      setHoveredFace(faceInfo);
    }
  }, [faceSelectionMode, mesh, partInfo.id, setHoveredFace]);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!faceSelectionMode) {
      setHoveredPartId(partInfo.id);
    }
  }, [faceSelectionMode, partInfo.id, setHoveredPartId]);

  const handlePointerOut = useCallback(() => {
    if (faceSelectionMode) {
      setHoveredFace(null);
    } else {
      setHoveredPartId(null);
    }
  }, [faceSelectionMode, setHoveredFace, setHoveredPartId]);

  return (
    <mesh
      ref={meshRef}
      castShadow
      receiveShadow
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <bufferGeometry ref={geoRef} />
      <meshStandardMaterial
        color={materialColor}
        emissive={emissiveColor}
        emissiveIntensity={emissiveIntensity}
        metalness={0.15}
        roughness={0.5}
        envMapIntensity={0.8}
        flatShading={false}
        side={THREE.DoubleSide}
      />
      {showWireframe && <Edges threshold={15} color="#666" />}
      {isHovered && !selected && !faceSelectionMode && (
        <Html position={center} center style={{ pointerEvents: "none" }}>
          <div className=" bg-surface border border-border px-2 py-1 text-xs text-text shadow-lg whitespace-nowrap">
            {partInfo.name}
          </div>
        </Html>
      )}
    </mesh>
  );
}
