import { useRef, useEffect } from "react";
import { MOUSE, Spherical, Vector3 } from "three";
import { useThree } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GridPlane } from "./GridPlane";
import { SceneMesh } from "./SceneMesh";
import { ClashMesh } from "./ClashMesh";
import { TransformGizmo } from "./TransformGizmo";
import { SelectionOverlay } from "./SelectionOverlay";
import { DimensionOverlay } from "./DimensionOverlay";
import { InlineProperties } from "./InlineProperties";
import { useEngineStore, useDocumentStore, useUiStore } from "@vcad/core";
import { useCameraControls } from "@/hooks/useCameraControls";

export function ViewportContent() {
  useCameraControls();
  const scene = useEngineStore((s) => s.scene);
  const parts = useDocumentStore((s) => s.parts);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  // Reusable objects to avoid GC pressure (wheel fires at 60+ Hz)
  const sphericalRef = useRef(new Spherical());
  const offsetRef = useRef(new Vector3());
  const velocityRef = useRef({ theta: 0, phi: 0 });
  const animatingRef = useRef(false);

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

      {/* Clash visualization (zebra pattern on intersections) */}
      {scene?.clashes.map((clashMesh, idx) => (
        <ClashMesh key={`clash-${idx}`} mesh={clashMesh} />
      ))}

      {/* Selection bounding box overlay */}
      <SelectionOverlay />

      {/* Dimension annotations for primitives */}
      <DimensionOverlay />

      {/* Inline properties card near selection */}
      <InlineProperties />

      {/* Transform gizmo for selected part */}
      <TransformGizmo orbitControls={orbitRef} />

      {/* Controls */}
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.1}
        mouseButtons={{
          LEFT: undefined,      // LMB reserved for selection
          MIDDLE: MOUSE.PAN,    // MMB = pan
          RIGHT: MOUSE.PAN,     // RMB = pan (fallback for mouse users)
        }}
      />

      {/* Orientation gizmo */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#7a6a65", "#657a6a", "#656a7a"]}
          labelColor="#75715E"
        />
      </GizmoHelper>
    </>
  );
}
