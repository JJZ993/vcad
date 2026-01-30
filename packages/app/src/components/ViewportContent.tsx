import { useRef, useEffect, useMemo } from "react";
import { MOUSE, Spherical, Vector3, Box3 } from "three";
import { useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  GizmoHelper,
  GizmoViewport,
  Environment,
  ContactShadows,
} from "@react-three/drei";
import { EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GridPlane } from "./GridPlane";
import { SceneMesh, ImportedMesh } from "./SceneMesh";
import { ClashMesh } from "./ClashMesh";
import { PreviewMesh } from "./PreviewMesh";
import { SketchPlane3D } from "./SketchPlane3D";
import { PlaneGizmo } from "./PlaneGizmo";
import { TransformGizmo } from "./TransformGizmo";
import { SelectionOverlay } from "./SelectionOverlay";
import { DimensionOverlay } from "./DimensionOverlay";
import {
  useEngineStore,
  useDocumentStore,
  useUiStore,
  useSketchStore,
} from "@vcad/core";
import type { PartInfo } from "@vcad/core";
import { useCameraControls } from "@/hooks/useCameraControls";
import { useTheme } from "@/hooks/useTheme";
import type { EvaluatedInstance } from "@vcad/engine";

function getInstanceSelectionId(inst: EvaluatedInstance): string {
  const instance = inst as {
    id?: string;
    instanceId?: string;
    partDefId?: string;
  };
  return instance.id ?? instance.instanceId ?? instance.partDefId ?? "";
}

export function ViewportContent() {
  useCameraControls();
  const scene = useEngineStore((s) => s.scene);
  const previewMesh = useEngineStore((s) => s.previewMesh);
  const parts = useDocumentStore((s) => s.parts);
  const document = useDocumentStore((s) => s.document);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const isDraggingGizmo = useUiStore((s) => s.isDraggingGizmo);
  const sketchActive = useSketchStore((s) => s.active);
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const { isDark } = useTheme();

  // Debug: log scene/parts alignment
  useEffect(() => {
    console.group("[VIEWPORT] Render state");
    console.log("scene.parts count:", scene?.parts.length);
    console.log("scene.parts details:", scene?.parts.map((p, i) => ({
      index: i,
      material: p.material,
      triangles: p.mesh.indices.length / 3,
    })));
    console.log("store parts count:", parts.length);
    console.log("store parts:", parts.map(p => ({ id: p.id, name: p.name, kind: p.kind, translateNodeId: p.translateNodeId })));
    console.log("document.roots:", JSON.stringify(document.roots, null, 2));
    console.log("ALIGNMENT CHECK: scene.parts.length === parts.length?", scene?.parts.length === parts.length);
    console.groupEnd();
  }, [scene, parts, document.roots]);

  // Reusable objects to avoid GC pressure (wheel fires at 60+ Hz)
  const sphericalRef = useRef(new Spherical());
  const offsetRef = useRef(new Vector3());
  const velocityRef = useRef({ theta: 0, phi: 0 });
  const animatingRef = useRef(false);

  // Target animation for orbit focus
  const targetGoalRef = useRef(new Vector3());
  const distanceGoalRef = useRef<number | null>(null);
  const isAnimatingTargetRef = useRef(false);

  // Camera position goal for face-aligned view
  const cameraPositionGoalRef = useRef<Vector3 | null>(null);

  // Initial camera state for reset
  const INITIAL_POSITION = new Vector3(50, 50, 50);
  const INITIAL_TARGET = new Vector3(0, 0, 0);
  const INITIAL_DISTANCE = INITIAL_POSITION.distanceTo(INITIAL_TARGET);

  // Build mapping from root index to instance ID (for assembly mode rendering with legacy parts)
  const rootIndexToInstanceId = useMemo(() => {
    const mapping = new Map<number, string>();
    if (!document.instances || !document.partDefs) return mapping;

    // Build root NodeId -> root index lookup
    const rootToIndex = new Map<number, number>();
    document.roots.forEach((entry, idx) => {
      rootToIndex.set(entry.root, idx);
    });

    // Map each instance to its corresponding root index
    for (const instance of document.instances) {
      const partDef = document.partDefs[instance.partDefId];
      if (!partDef) continue;
      const rootIdx = rootToIndex.get(partDef.root);
      if (rootIdx !== undefined) {
        mapping.set(rootIdx, instance.id);
      }
    }
    return mapping;
  }, [document.instances, document.partDefs, document.roots]);

  // Check if a part at given index is selected (handles both part IDs and instance IDs)
  const isPartSelected = (partId: string, partIndex: number): boolean => {
    // Direct part ID match
    if (selectedPartIds.has(partId)) return true;
    // Instance ID match (for assembly mode)
    const instanceId = rootIndexToInstanceId.get(partIndex);
    if (instanceId && selectedPartIds.has(instanceId)) return true;
    return false;
  };

  // Calculate center and size of selected parts/instances
  const selectionInfo = useMemo(() => {
    if (selectedPartIds.size === 0 || !scene) return null;

    const box = new Box3();
    const tempVec = new Vector3();
    let hasPoints = false;

    // Assembly mode: check instances
    if (scene.instances && scene.instances.length > 0) {
      for (const inst of scene.instances) {
        const instanceSelectionId = getInstanceSelectionId(inst);
        if (!instanceSelectionId || !selectedPartIds.has(instanceSelectionId))
          continue;

        const positions = inst.mesh.positions;
        const t = inst.transform ?? {
          translation: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        };
        for (let i = 0; i < positions.length; i += 3) {
          // Apply instance transform to positions for accurate bounding box
          tempVec.set(
            positions[i]! * t.scale.x + t.translation.x,
            positions[i + 1]! * t.scale.y + t.translation.y,
            positions[i + 2]! * t.scale.z + t.translation.z,
          );
          box.expandByPoint(tempVec);
          hasPoints = true;
        }
      }
    } else {
      // Legacy mode: check parts (also handles instance IDs via isPartSelected)
      parts.forEach((part, index) => {
        if (!isPartSelected(part.id, index)) return;
        const evalPart = scene.parts[index];
        if (!evalPart) return;

        const positions = evalPart.mesh.positions;
        for (let i = 0; i < positions.length; i += 3) {
          tempVec.set(positions[i]!, positions[i + 1]!, positions[i + 2]!);
          box.expandByPoint(tempVec);
          hasPoints = true;
        }
      });
    }

    if (!hasPoints) return null;
    const center = new Vector3();
    box.getCenter(center);
    const size = new Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    return { center, maxDim };
  }, [selectedPartIds, scene, parts, rootIndexToInstanceId]);

  // Animate orbit target to selection center and zoom to fit
  // Skip during gizmo drag to avoid fighting with the user's transform
  useEffect(() => {
    if (selectionInfo && !isDraggingGizmo) {
      targetGoalRef.current.copy(selectionInfo.center);
      // Distance = 2.5x the max dimension, clamped to reasonable range
      distanceGoalRef.current = Math.max(
        30,
        Math.min(300, selectionInfo.maxDim * 2.5),
      );
      isAnimatingTargetRef.current = true;
    }
  }, [selectionInfo, isDraggingGizmo]);

  // Smooth target and distance animation
  useFrame(() => {
    if (!isAnimatingTargetRef.current || !orbitRef.current) return;

    const target = orbitRef.current.target;
    const targetGoal = targetGoalRef.current;
    const distanceGoal = distanceGoalRef.current;
    const cameraPositionGoal = cameraPositionGoalRef.current;
    const lerpFactor = 0.1;

    // Animate target position
    target.lerp(targetGoal, lerpFactor);

    // Animate camera position if we have a specific goal (face-aligned view)
    if (cameraPositionGoal !== null) {
      camera.position.lerp(cameraPositionGoal, lerpFactor);
      camera.lookAt(target);
      orbitRef.current.update();
    } else if (distanceGoal !== null) {
      // Animate camera distance only (keep current direction)
      const offset = offsetRef.current.subVectors(camera.position, target);
      const currentDist = offset.length();
      const newDist = currentDist + (distanceGoal - currentDist) * lerpFactor;
      offset.normalize().multiplyScalar(newDist);
      camera.position.copy(target).add(offset);
    }

    // Stop animating when close enough
    const targetDone = target.distanceTo(targetGoal) < 0.01;
    const distanceDone =
      distanceGoal === null ||
      Math.abs(
        offsetRef.current.subVectors(camera.position, target).length() -
          distanceGoal,
      ) < 0.1;
    const positionDone =
      cameraPositionGoal === null ||
      camera.position.distanceTo(cameraPositionGoal) < 0.1;

    if (targetDone && distanceDone && positionDone) {
      target.copy(targetGoal);
      if (cameraPositionGoal) {
        camera.position.copy(cameraPositionGoal);
        camera.lookAt(target);
      }
      isAnimatingTargetRef.current = false;
      distanceGoalRef.current = null;
      cameraPositionGoalRef.current = null;
    }
  });

  // Wheel-to-orbit: two-finger trackpad drag → orbit with momentum
  useEffect(() => {
    const controls = orbitRef.current;
    const domElement = controls?.domElement;
    if (!domElement) return;

    const dampingFactor = 0.15; // fraction of velocity applied per frame
    const friction = 0.92; // velocity decay per frame

    const animate = () => {
      const vel = velocityRef.current;
      // Stop animating when velocity is negligible
      if (Math.abs(vel.theta) < 0.0001 && Math.abs(vel.phi) < 0.0001) {
        animatingRef.current = false;
        vel.theta = 0;
        vel.phi = 0;
        return;
      }

      const target = controls.target;
      const offset = offsetRef.current.subVectors(camera.position, target);
      const spherical = sphericalRef.current.setFromVector3(offset);

      // Apply fraction of velocity
      spherical.theta += vel.theta * dampingFactor;
      spherical.phi += vel.phi * dampingFactor;

      // Clamp polar angle to avoid flipping
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));

      // Decay velocity
      vel.theta *= friction;
      vel.phi *= friction;

      // Update camera position
      offset.setFromSpherical(spherical);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
      controls.update();

      requestAnimationFrame(animate);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Normalize deltaMode: 0=pixels, 1=lines, 2=pages
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } // lines → pixels
      if (e.deltaMode === 2) {
        dx *= 100;
        dy *= 100;
      } // pages → pixels

      // Shift + scroll = zoom
      if (e.shiftKey) {
        const zoomSpeed = 0.002;
        const delta = -(Math.abs(dy) > Math.abs(dx) ? dy : dx) * zoomSpeed;
        const target = controls.target;
        const offset = offsetRef.current.subVectors(camera.position, target);
        const distance = offset.length();
        const newDistance = Math.max(1, distance * (1 + delta));
        offset.normalize().multiplyScalar(newDistance);
        camera.position.copy(target).add(offset);
        controls.update();
        return;
      }

      // Cmd + scroll = pan (push camera and target in screen space)
      if (e.metaKey) {
        const target = controls.target;
        const offset = offsetRef.current.subVectors(camera.position, target);
        const distance = offset.length();

        // Scale pan speed by distance so it feels consistent at any zoom
        const panSpeed = distance * 0.002;

        // Get camera's right and up vectors in world space
        const right = new Vector3();
        const up = new Vector3();
        camera.matrix.extractBasis(right, up, new Vector3());

        // Calculate pan offset: drag to pull the view
        const panOffset = right
          .multiplyScalar(dx * panSpeed)
          .add(up.multiplyScalar(-dy * panSpeed));

        // Move both camera and target by the same amount
        camera.position.add(panOffset);
        target.add(panOffset);
        controls.update();
        return;
      }

      // OrbitControls formula: viewport height = 2π radians
      const rotateSpeed = (2 * Math.PI) / domElement.clientHeight;

      // Accumulate velocity: deltaX → azimuthal (theta), deltaY → polar (phi)
      velocityRef.current.theta += dx * rotateSpeed;
      velocityRef.current.phi += dy * rotateSpeed;

      // Start animation loop if not already running
      if (!animatingRef.current) {
        animatingRef.current = true;
        requestAnimationFrame(animate);
      }
    };

    domElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => domElement.removeEventListener("wheel", handleWheel);
  }, [camera]);

  // Double-click on empty canvas resets camera to initial position
  useEffect(() => {
    const controls = orbitRef.current;
    const domElement = controls?.domElement;
    if (!domElement) return;

    const handleDoubleClick = () => {
      // Only reset when nothing is selected
      if (useUiStore.getState().selectedPartIds.size > 0) return;

      // Animate to initial position
      targetGoalRef.current.copy(INITIAL_TARGET);
      distanceGoalRef.current = INITIAL_DISTANCE;
      cameraPositionGoalRef.current = null; // Clear any position goal
      isAnimatingTargetRef.current = true;
    };

    domElement.addEventListener("dblclick", handleDoubleClick);
    return () => domElement.removeEventListener("dblclick", handleDoubleClick);
  }, []);

  // Face selection: swing camera to view face flat
  useEffect(() => {
    const handleFaceSelected = (
      e: CustomEvent<{
        normal: { x: number; y: number; z: number };
        centroid: { x: number; y: number; z: number };
      }>,
    ) => {
      const { normal, centroid } = e.detail;

      // Set target to face centroid
      targetGoalRef.current.set(centroid.x, centroid.y, centroid.z);

      // Camera should be positioned along the positive normal (in front of the face, looking at it)
      // Distance of 60mm for a good view
      const viewDistance = 60;
      const cameraPos = new Vector3(
        centroid.x + normal.x * viewDistance,
        centroid.y + normal.y * viewDistance,
        centroid.z + normal.z * viewDistance,
      );
      cameraPositionGoalRef.current = cameraPos;
      distanceGoalRef.current = viewDistance;
      isAnimatingTargetRef.current = true;
    };

    window.addEventListener(
      "vcad:face-selected",
      handleFaceSelected as EventListener,
    );
    return () =>
      window.removeEventListener(
        "vcad:face-selected",
        handleFaceSelected as EventListener,
      );
  }, []);

  // Snap view: animate camera to predefined positions
  useEffect(() => {
    const CAMERA_DISTANCE = 80;
    const SNAP_VIEWS: Record<string, [number, number, number]> = {
      front: [0, 0, CAMERA_DISTANCE],
      back: [0, 0, -CAMERA_DISTANCE],
      right: [CAMERA_DISTANCE, 0, 0],
      left: [-CAMERA_DISTANCE, 0, 0],
      top: [0, CAMERA_DISTANCE, 0],
      bottom: [0, -CAMERA_DISTANCE, 0],
      iso: [50, 50, 50],
      hero: [60, 45, 60], // 45deg azimuth, 30deg elevation - dramatic presentation angle
    };

    const handleSnapView = (e: CustomEvent<string>) => {
      const view = e.detail;
      const pos = SNAP_VIEWS[view];
      if (!pos) return;

      // Animate to the new position
      targetGoalRef.current.set(0, 0, 0);
      cameraPositionGoalRef.current = new Vector3(pos[0], pos[1], pos[2]);
      distanceGoalRef.current = null; // Don't override distance when we have explicit position
      isAnimatingTargetRef.current = true;
    };

    window.addEventListener("vcad:snap-view", handleSnapView as EventListener);
    return () =>
      window.removeEventListener(
        "vcad:snap-view",
        handleSnapView as EventListener,
      );
  }, []);

  // Hero view: special "Make It Real" presentation angle
  useEffect(() => {
    const handleHeroView = () => {
      // Hero angle: 45deg azimuth, 30deg elevation - dramatic presentation angle
      const heroPos = new Vector3(60, 45, 60);

      // Animate to hero position
      targetGoalRef.current.set(0, 0, 0);
      cameraPositionGoalRef.current = heroPos;
      distanceGoalRef.current = null;
      isAnimatingTargetRef.current = true;
    };

    window.addEventListener("vcad:hero-view", handleHeroView);
    return () => window.removeEventListener("vcad:hero-view", handleHeroView);
  }, []);

  return (
    <>
      {/* Environment lighting - subtle studio setup */}
      <Environment preset="studio" environmentIntensity={0.4} />

      {/* Key light with shadows */}
      <directionalLight
        position={[50, 80, 40]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={200}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-bias={-0.0001}
      />
      {/* Fill light */}
      <directionalLight position={[-30, 40, -20]} intensity={0.4} />
      {/* Rim light for edge definition */}
      <directionalLight position={[-50, 20, 50]} intensity={0.2} />

      {/* Contact shadows - soft shadow beneath objects */}
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={isDark ? 0.4 : 0.3}
        scale={200}
        blur={2}
        far={100}
        resolution={512}
        color={isDark ? "#000000" : "#1a1a1a"}
      />

      {/* Grid */}
      <GridPlane />

      {/* Plane gizmo at origin - click to start sketch */}
      <PlaneGizmo />

      {/* Scene meshes - Assembly mode (instances) */}
      {scene?.instances?.map((inst: EvaluatedInstance) => {
        const instanceSelectionId = getInstanceSelectionId(inst);
        // Create a minimal PartInfo-like object for instance rendering
        const instancePartInfo: PartInfo = {
          id: instanceSelectionId,
          name: inst.name ?? inst.partDefId,
          kind: "cube", // Placeholder kind for instances
          primitiveNodeId: 0,
          scaleNodeId: 0,
          rotateNodeId: 0,
          translateNodeId: 0,
        };
        return (
          <SceneMesh
            key={inst.instanceId}
            partInfo={instancePartInfo}
            mesh={inst.mesh}
            materialKey={inst.material}
            selected={selectedPartIds.has(instanceSelectionId)}
            transform={inst.transform}
          />
        );
      })}

      {/* Imported meshes (no PartInfo - direct mesh display) */}
      {(!scene?.instances || scene.instances.length === 0) &&
        parts.length === 0 &&
        scene?.parts.map((evalPart, idx) => (
          <ImportedMesh
            key={`imported-${idx}`}
            mesh={evalPart.mesh}
            materialKey={evalPart.material}
          />
        ))}

      {/* Scene meshes - Legacy mode (parts with PartInfo) */}
      {(!scene?.instances || scene.instances.length === 0) &&
        parts.length > 0 &&
        scene?.parts.map((evalPart, idx) => {
          const partInfo = parts[idx];
          if (!partInfo) return null;
          return (
            <SceneMesh
              key={partInfo.id}
              partInfo={partInfo}
              mesh={evalPart.mesh}
              materialKey={evalPart.material}
              selected={isPartSelected(partInfo.id, idx)}
            />
          );
        })}

      {/* Clash visualization (zebra pattern on intersections) */}
      {scene?.clashes.map((clashMesh, idx) => (
        <ClashMesh key={`clash-${idx}`} mesh={clashMesh} />
      ))}

      {/* Extrusion preview (semi-transparent) */}
      {previewMesh && <PreviewMesh mesh={previewMesh} />}

      {/* 3D Sketch plane (when sketch mode is active) */}
      {sketchActive && <SketchPlane3D />}

      {/* Selection bounding box overlay */}
      <SelectionOverlay />

      {/* Dimension annotations for primitives */}
      <DimensionOverlay />

      {/* Transform gizmo for selected part */}
      <TransformGizmo orbitControls={orbitRef} />

      {/* Controls */}
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.1}
        enableZoom={false}
        mouseButtons={{
          LEFT: undefined, // LMB reserved for selection
          MIDDLE: MOUSE.PAN, // MMB = pan
          RIGHT: MOUSE.PAN, // RMB = pan (fallback for mouse users)
        }}
      />

      {/* Orientation gizmo - RGB axes, click to snap view */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#e06c75", "#98c379", "#61afef"]}
          labelColor="#abb2bf"
        />
      </GizmoHelper>

      {/* Post-processing effects */}
      <EffectComposer>
        {/* N8AO - high quality ambient occlusion */}
        <N8AO
          aoRadius={0.5}
          intensity={isDark ? 2 : 1.5}
          aoSamples={6}
          denoiseSamples={4}
        />
        {/* Subtle vignette for focus */}
        <Vignette offset={0.3} darkness={isDark ? 0.5 : 0.3} eskil={false} />
      </EffectComposer>
    </>
  );
}
