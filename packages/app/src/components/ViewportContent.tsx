import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { GridPlane } from "./GridPlane";
import { SceneMesh } from "./SceneMesh";
import { TransformGizmo } from "./TransformGizmo";
import { useEngineStore } from "@/stores/engine-store";
import { useDocumentStore } from "@/stores/document-store";
import { useUiStore } from "@/stores/ui-store";
import { useCameraControls } from "@/hooks/useCameraControls";
import { useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export function ViewportContent() {
  useCameraControls();
  const scene = useEngineStore((s) => s.scene);
  const parts = useDocumentStore((s) => s.parts);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const orbitRef = useRef<OrbitControlsImpl>(null);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[50, 80, 40]} intensity={0.8} />
      <directionalLight position={[-30, 40, -20]} intensity={0.3} />

      {/* Grid */}
      <GridPlane />

      {/* Scene meshes */}
      {scene?.parts.map((evalPart, idx) => {
        const partInfo = parts[idx];
        if (!partInfo) return null;
        return (
          <SceneMesh
            key={partInfo.id}
            partInfo={partInfo}
            mesh={evalPart.mesh}
            selected={selectedPartIds.has(partInfo.id)}
          />
        );
      })}

      {/* Transform gizmo for selected part */}
      <TransformGizmo orbitControls={orbitRef} />

      {/* Controls */}
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.1}
      />

      {/* Orientation gizmo */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="white"
        />
      </GizmoHelper>
    </>
  );
}
