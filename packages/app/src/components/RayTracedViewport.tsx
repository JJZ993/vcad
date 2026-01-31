import { useRef, useEffect, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useEngineStore, useUiStore } from "@vcad/core";
import { getRayTracer } from "@vcad/engine";
import type { PerspectiveCamera } from "three";

// Store for syncing camera state from R3F to external overlay
type CameraState = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  width: number;
  height: number;
};

let cameraStateCallback: ((state: CameraState) => void) | null = null;

export function setCameraStateCallback(cb: ((state: CameraState) => void) | null) {
  cameraStateCallback = cb;
}

/**
 * Internal component that syncs R3F camera state and triggers renders.
 * Must be placed inside the R3F Canvas.
 */
export function RayTracedViewportSync() {
  const scene = useEngineStore((s) => s.scene);
  const { camera, size, controls } = useThree();
  const rayTracer = getRayTracer();

  // Track if we've uploaded the scene
  const uploadedRef = useRef(false);

  // Track last camera state for dirty checking
  const lastCameraRef = useRef({ x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 });

  // Upload scene when it changes
  useEffect(() => {
    if (!rayTracer || !scene?.parts?.length) {
      uploadedRef.current = false;
      return;
    }

    // Try to upload first part with a solid
    let uploaded = false;
    for (const p of scene.parts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solid = (p as any).solid;
      if (!solid) continue;

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        rayTracer.uploadSolid(solid);
        uploaded = true;
        break;
      } catch {
        // Try next solid
      }
    }
    uploadedRef.current = uploaded;
  }, [scene, rayTracer]);

  // Sync camera state on every frame
  useFrame(() => {
    if (!rayTracer || !uploadedRef.current || !cameraStateCallback) return;

    const cam = camera as PerspectiveCamera;

    // Get orbit target from controls if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orbitControls = controls as any;
    const target = orbitControls?.target ?? { x: 0, y: 0, z: 0 };

    // Check if camera changed (dirty check)
    const last = lastCameraRef.current;
    const EPSILON = 0.001;
    const cameraMoved =
      Math.abs(cam.position.x - last.x) > EPSILON ||
      Math.abs(cam.position.y - last.y) > EPSILON ||
      Math.abs(cam.position.z - last.z) > EPSILON ||
      Math.abs(target.x - last.tx) > EPSILON ||
      Math.abs(target.y - last.ty) > EPSILON ||
      Math.abs(target.z - last.tz) > EPSILON;

    if (cameraMoved) {
      lastCameraRef.current = {
        x: cam.position.x,
        y: cam.position.y,
        z: cam.position.z,
        tx: target.x,
        ty: target.y,
        tz: target.z,
      };

      cameraStateCallback({
        position: [cam.position.x, cam.position.y, cam.position.z],
        target: [target.x, target.y, target.z],
        fov: cam.fov,
        width: size.width,
        height: size.height,
      });
    }
  });

  return null;
}

/**
 * Ray-traced viewport overlay that renders BRep geometry directly
 * without tessellation artifacts.
 *
 * This component renders an HTML canvas that overlays the Three.js scene,
 * providing pixel-perfect silhouettes for CAD geometry.
 *
 * Must be placed OUTSIDE the R3F Canvas (as a sibling).
 */
export function RayTracedViewportOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raytraceQuality = useUiStore((s) => s.raytraceQuality);
  const rayTracer = getRayTracer();

  // Track pending async render to avoid overlapping calls
  const renderInProgressRef = useRef(false);
  const needsRenderRef = useRef(true);
  const lastCameraStateRef = useRef<CameraState | null>(null);

  // Quality multiplier for render resolution
  const qualityScale =
    raytraceQuality === "draft" ? 0.5 : raytraceQuality === "high" ? 2 : 1;

  // Track frame count for sparse logging
  const frameCountRef = useRef(0);

  // Helper to draw pixels to canvas
  const drawPixels = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      pixels: Uint8Array,
      renderWidth: number,
      renderHeight: number,
      canvasWidth: number,
      canvasHeight: number
    ) => {
      const imageData = new ImageData(
        new Uint8ClampedArray(pixels),
        renderWidth,
        renderHeight
      );

      // Scale to canvas if needed
      if (qualityScale !== 1 || renderWidth !== canvasWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = renderWidth;
        tempCanvas.height = renderHeight;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(tempCanvas, 0, 0, canvasWidth, canvasHeight);
        }
      } else {
        ctx.putImageData(imageData, 0, 0);
      }
    },
    [qualityScale]
  );

  // Render function
  const doRender = useCallback(
    (state: CameraState) => {
      if (!rayTracer || !canvasRef.current || renderInProgressRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Update canvas size if needed
      if (canvas.width !== state.width || canvas.height !== state.height) {
        canvas.width = state.width;
        canvas.height = state.height;
      }

      frameCountRef.current++;

      // Calculate render dimensions, capped to prevent long renders
      const MAX_PIXELS = 640 * 480;
      let renderWidth = Math.floor(state.width * qualityScale);
      let renderHeight = Math.floor(state.height * qualityScale);
      const totalPixels = renderWidth * renderHeight;
      if (totalPixels > MAX_PIXELS) {
        const scale = Math.sqrt(MAX_PIXELS / totalPixels);
        renderWidth = Math.floor(renderWidth * scale);
        renderHeight = Math.floor(renderHeight * scale);
      }

      // Start async render
      renderInProgressRef.current = true;

      // Store dimensions for the async callback
      const w = renderWidth;
      const h = renderHeight;
      const cw = state.width;
      const ch = state.height;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (
        rayTracer.render(
          state.position,
          state.target,
          [0, 1, 0], // up vector
          renderWidth,
          renderHeight,
          (state.fov * Math.PI) / 180
        ) as Promise<Uint8Array>
      )
        .then((pixels: Uint8Array) => {
          const drawCanvas = canvasRef.current;
          if (drawCanvas) {
            const drawCtx = drawCanvas.getContext("2d");
            if (drawCtx) {
              drawPixels(drawCtx, pixels, w, h, cw, ch);

              // Log stats occasionally
              if (frameCountRef.current % 60 === 0) {
                let opaquePixels = 0;
                for (let i = 3; i < pixels.length; i += 4) {
                  if ((pixels[i] ?? 0) > 0) opaquePixels++;
                }
                console.log("[RayTracedViewport] Render stats:", {
                  width: w,
                  height: h,
                  opaquePixels,
                  totalPixels: w * h,
                });
              }
            }
          }
          renderInProgressRef.current = false;

          // If camera moved while rendering, render again
          if (needsRenderRef.current && lastCameraStateRef.current) {
            needsRenderRef.current = false;
            doRender(lastCameraStateRef.current);
          }
        })
        .catch((e: Error) => {
          console.debug("[RayTracedViewport] Render failed:", e);
          renderInProgressRef.current = false;
        });
    },
    [rayTracer, qualityScale, drawPixels]
  );

  // Register callback for camera updates
  useEffect(() => {
    setCameraStateCallback((state) => {
      lastCameraStateRef.current = state;
      if (!renderInProgressRef.current) {
        doRender(state);
      } else {
        needsRenderRef.current = true;
      }
    });

    return () => {
      setCameraStateCallback(null);
    };
  }, [doRender]);

  // Re-render when quality changes
  useEffect(() => {
    if (lastCameraStateRef.current) {
      doRender(lastCameraStateRef.current);
    }
  }, [raytraceQuality, doRender]);

  if (!rayTracer) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * @deprecated Use RayTracedViewportSync inside Canvas and RayTracedViewportOverlay outside.
 */
export function RayTracedViewport() {
  // This component is now split into two parts for proper rendering.
  // Return null to avoid errors - the new components should be used instead.
  return null;
}
