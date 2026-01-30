import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Edges, Html } from "@react-three/drei";
import type { TriangleMesh, PartInfo, FaceInfo } from "@vcad/core";
import { useUiStore, useDocumentStore, useSketchStore } from "@vcad/core";
import type { ThreeEvent } from "@react-three/fiber";
import type { Transform3D } from "@vcad/ir";

const HOVER_EMISSIVE = new THREE.Color(0xffb800); // neon amber
const FACE_SELECT_EMISSIVE = new THREE.Color(0x00d4ff); // cyan for face selection

const DEG2RAD = Math.PI / 180;

interface SceneMeshProps {
  partInfo: PartInfo;
  mesh: TriangleMesh;
  materialKey: string;
  selected: boolean;
  transform?: Transform3D;
  /** Override ID used for selection (e.g., instance ID instead of part ID) */
  selectionId?: string;
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

export function SceneMesh({ partInfo, mesh, materialKey, selected, transform, selectionId }: SceneMeshProps) {
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const showWireframe = useUiStore((s) => s.showWireframe);
  const hoveredPartId = useUiStore((s) => s.hoveredPartId);
  const setHoveredPartId = useUiStore((s) => s.setHoveredPartId);
  const document = useDocumentStore((s) => s.document);
  const renamePart = useDocumentStore((s) => s.renamePart);

  // Face selection state
  const faceSelectionMode = useSketchStore((s) => s.faceSelectionMode);
  const hoveredFace = useSketchStore((s) => s.hoveredFace);
  const setHoveredFace = useSketchStore((s) => s.setHoveredFace);
  const selectFace = useSketchStore((s) => s.selectFace);

  // Use selectionId if provided, otherwise fall back to partInfo.id
  const effectiveSelectionId = selectionId ?? partInfo.id;
  const isHovered = hoveredPartId === effectiveSelectionId;
  const isHoveredFace = faceSelectionMode && hoveredFace?.partId === partInfo.id;
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(partInfo.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Resolve material color from document using the materialKey passed from evaluation
  const materialColor = useMemo(() => {
    const mat = document.materials[materialKey];
    if (mat) {
      return new THREE.Color(mat.color[0], mat.color[1], mat.color[2]);
    }
    return new THREE.Color(0.7, 0.7, 0.75);
  }, [document, materialKey]);

  // Compute emissive state: face selection mode > selected > hovered > none
  const emissiveColor = useMemo(() => {
    if (isHoveredFace) return FACE_SELECT_EMISSIVE;
    if (selected) return materialColor.clone().multiplyScalar(0.3);
    if (isHovered) return HOVER_EMISSIVE;
    return undefined;
  }, [selected, isHovered, isHoveredFace, materialColor]);

  const emissiveIntensity = isHoveredFace ? 0.15 : selected ? 0.2 : isHovered ? 0.08 : 0;

  useEffect(() => {
    setDraftName(partInfo.name);
  }, [partInfo.name, selected]);

  useEffect(() => {
    if (isRenaming) {
      nameInputRef.current?.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;

    // Clone arrays to avoid issues with transferred/shared buffers
    const positions = new Float32Array(mesh.positions);
    const indices = new Uint32Array(mesh.indices);

    // Create temp geometry to merge vertices for smooth normals
    const tempGeo = new THREE.BufferGeometry();
    tempGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    tempGeo.setIndex(new THREE.BufferAttribute(indices, 1));

    // Merge coincident vertices so normals can interpolate smoothly
    const mergedGeo = mergeVertices(tempGeo, 0.0001);
    mergedGeo.computeVertexNormals();

    // Copy merged data to our geometry
    geo.setAttribute("position", mergedGeo.getAttribute("position"));
    geo.setAttribute("normal", mergedGeo.getAttribute("normal"));
    if (mergedGeo.index) {
      geo.setIndex(mergedGeo.index);
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    // Cleanup temp geometry
    tempGeo.dispose();
    mergedGeo.dispose();

    return () => {
      geo.dispose();
    };
  }, [mesh]);

  // Apply Transform3D to mesh (for assembly instances)
  useEffect(() => {
    const m = meshRef.current;
    if (!m) return;

    if (transform) {
      m.position.set(
        transform.translation.x,
        transform.translation.y,
        transform.translation.z
      );
      const euler = new THREE.Euler(
        transform.rotation.x * DEG2RAD,
        transform.rotation.y * DEG2RAD,
        transform.rotation.z * DEG2RAD,
        "XYZ"
      );
      m.quaternion.setFromEuler(euler);
      m.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
    } else {
      // Reset to identity if no transform
      m.position.set(0, 0, 0);
      m.quaternion.identity();
      m.scale.set(1, 1, 1);
    }
  }, [transform]);

  // Compute name tag position above the part
  const labelPosition = useMemo(() => {
    if (!mesh.positions.length) return new THREE.Vector3();
    const box = new THREE.Box3();
    const pos = new THREE.Vector3();
    for (let i = 0; i < mesh.positions.length; i += 3) {
      pos.set(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!);
      box.expandByPoint(pos);
    }
    const topCenter = new THREE.Vector3();
    box.getCenter(topCenter);
    topCenter.y = box.max.y + 4;
    return topCenter;
  }, [mesh.positions]);

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== partInfo.name) {
      renamePart(partInfo.id, trimmed);
    }
    setIsRenaming(false);
  }, [draftName, partInfo.id, partInfo.name, renamePart]);

  const cancelRename = useCallback(() => {
    setDraftName(partInfo.name);
    setIsRenaming(false);
  }, [partInfo.name]);

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
      {selected && !faceSelectionMode && (
        <Html position={labelPosition} center style={{ pointerEvents: "auto" }}>
          <div className="px-2 py-1 text-xs font-medium text-text whitespace-nowrap">
            {isRenaming ? (
              <input
                ref={nameInputRef}
                type="text"
                value={draftName}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                }}
                className="min-w-[80px] bg-transparent text-text outline-none"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRenaming(true);
                }}
                className="text-text"
              >
                {partInfo.name}
              </button>
            )}
          </div>
        </Html>
      )}
    </mesh>
  );
}
