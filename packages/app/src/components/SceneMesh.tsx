import { useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { Edges } from "@react-three/drei";
import type { TriangleMesh } from "@vcad/engine";
import type { PartInfo } from "@/types";
import { useUiStore } from "@/stores/ui-store";
import { useDocumentStore } from "@/stores/document-store";

const SELECTED_COLOR = new THREE.Color(0x60a5fa);
const SELECTED_EMISSIVE = new THREE.Color(0x2563eb);

interface SceneMeshProps {
  partInfo: PartInfo;
  mesh: TriangleMesh;
  selected: boolean;
}

export function SceneMesh({ partInfo, mesh, selected }: SceneMeshProps) {
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const showWireframe = useUiStore((s) => s.showWireframe);
  const document = useDocumentStore((s) => s.document);

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

  return (
    <mesh
      onClick={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.shiftKey) {
          toggleSelect(partInfo.id);
        } else {
          select(partInfo.id);
        }
      }}
    >
      <bufferGeometry ref={geoRef} />
      <meshStandardMaterial
        color={selected ? SELECTED_COLOR : materialColor}
        emissive={selected ? SELECTED_EMISSIVE : undefined}
        emissiveIntensity={selected ? 0.15 : 0}
        metalness={0.1}
        roughness={0.6}
        flatShading={false}
      />
      {showWireframe && <Edges threshold={15} color="#666" />}
    </mesh>
  );
}
