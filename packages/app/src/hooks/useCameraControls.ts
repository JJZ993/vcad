import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEngineStore, useUiStore, useDocumentStore } from "@vcad/core";

// Predefined camera positions (distance from origin)
const CAMERA_DISTANCE = 80;
const SNAP_VIEWS: Record<string, [number, number, number]> = {
  front: [0, 0, CAMERA_DISTANCE],
  back: [0, 0, -CAMERA_DISTANCE],
  right: [CAMERA_DISTANCE, 0, 0],
  left: [-CAMERA_DISTANCE, 0, 0],
  top: [0, CAMERA_DISTANCE, 0],
  bottom: [0, -CAMERA_DISTANCE, 0],
  iso: [50, 50, 50],
};

export function useCameraControls() {
  const camera = useThree((s) => s.camera);
  const controls = useThree(
    (s) => s.controls as THREE.EventDispatcher & { target?: THREE.Vector3 } | null,
  );

  useEffect(() => {
    function handleSnapView(e: Event) {
      const view = (e as CustomEvent<string>).detail;
      const pos = SNAP_VIEWS[view];
      if (!pos || !camera) return;

      camera.position.set(pos[0], pos[1], pos[2]);
      camera.lookAt(0, 0, 0);
      if (controls && "target" in controls && controls.target) {
        controls.target.set(0, 0, 0);
      }
    }

    function handleFocusSelection() {
      const { selectedPartIds } = useUiStore.getState();
      if (selectedPartIds.size === 0) return;

      const scene = useEngineStore.getState().scene;
      const parts = useDocumentStore.getState().parts;
      if (!scene) return;

      // Compute bounding box from selected parts' meshes
      const box = new THREE.Box3();
      let found = false;
      for (const [idx, evalPart] of scene.parts.entries()) {
        const partInfo = parts[idx];
        if (!partInfo || !selectedPartIds.has(partInfo.id)) continue;

        const positions = evalPart.mesh.positions;
        for (let i = 0; i < positions.length; i += 3) {
          box.expandByPoint(
            new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]),
          );
        }
        found = true;
      }

      if (!found) return;

      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 1);

      // Position camera to frame the bounding box
      const dist = maxDim * 2;
      const dir = new THREE.Vector3()
        .copy(camera.position)
        .sub(
          controls && "target" in controls && controls.target
            ? controls.target
            : new THREE.Vector3(0, 0, 0),
        )
        .normalize();

      camera.position.copy(center).addScaledVector(dir, dist);
      if (controls && "target" in controls && controls.target) {
        controls.target.copy(center);
      }
    }

    window.addEventListener("vcad:snap-view", handleSnapView);
    window.addEventListener("vcad:focus-selection", handleFocusSelection);
    return () => {
      window.removeEventListener("vcad:snap-view", handleSnapView);
      window.removeEventListener("vcad:focus-selection", handleFocusSelection);
    };
  }, [camera, controls]);
}
