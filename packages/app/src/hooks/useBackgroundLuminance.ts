import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Samples the canvas luminance behind a given screen region.
 * Returns "light" or "dark" based on average brightness.
 * Only samples when camera stops moving to avoid performance impact.
 */
export function useBackgroundLuminance(
  canvasSelector = "canvas",
  region?: { x: number; y: number; width: number; height: number },
  idleDelayMs = 300
): "light" | "dark" {
  const [luminance, setLuminance] = useState<"light" | "dark">("dark");
  const idleTimerRef = useRef<number | null>(null);
  const lastSampleRef = useRef<number>(0);

  const sample = useCallback(() => {
    const canvas = document.querySelector(canvasSelector) as HTMLCanvasElement;
    if (!canvas) return;

    // Default to top-left corner region if not specified
    const r = region ?? { x: 10, y: 70, width: 180, height: 300 };

    try {
      // Use toDataURL + offscreen canvas (works regardless of preserveDrawingBuffer)
      const dataUrl = canvas.toDataURL("image/png");
      const img = new Image();
      img.onload = () => {
        // Create small offscreen canvas to sample the region
        const offscreen = document.createElement("canvas");
        const ctx = offscreen.getContext("2d");
        if (!ctx) return;

        // Only need to draw/sample a small region
        offscreen.width = r.width;
        offscreen.height = r.height;
        ctx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);

        // Sample a grid of points
        const samplePoints = [
          { x: 20, y: 30 },
          { x: 90, y: 80 },
          { x: 40, y: 150 },
          { x: 120, y: 200 },
          { x: 60, y: 250 },
        ];

        let totalLuminance = 0;
        let validSamples = 0;

        for (const point of samplePoints) {
          if (point.x >= r.width || point.y >= r.height) continue;

          const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
          // Calculate relative luminance (ITU-R BT.709)
          const lum = (0.2126 * (pixel[0] ?? 0) + 0.7152 * (pixel[1] ?? 0) + 0.0722 * (pixel[2] ?? 0)) / 255;
          totalLuminance += lum;
          validSamples++;
        }

        if (validSamples > 0) {
          const avgLuminance = totalLuminance / validSamples;
          const result = avgLuminance > 0.5 ? "light" : "dark";
          setLuminance(result);
        }
      };
      img.src = dataUrl;
    } catch {
      // Canvas may not be ready yet
    }
  }, [canvasSelector, region]);

  // Schedule a sample after idle delay
  const scheduleSample = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      // Throttle: don't sample more than once per second
      const now = Date.now();
      if (now - lastSampleRef.current > 1000) {
        lastSampleRef.current = now;
        sample();
      }
    }, idleDelayMs);
  }, [sample, idleDelayMs]);

  useEffect(() => {
    // Sample once on mount (after a short delay for canvas to render)
    const initialTimer = setTimeout(sample, 500);

    // Sample when camera stops moving
    const handleCameraEnd = () => scheduleSample();
    window.addEventListener("vcad:camera-end", handleCameraEnd);

    // Also sample on pointer up (end of interaction)
    const handlePointerUp = () => scheduleSample();
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      clearTimeout(initialTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener("vcad:camera-end", handleCameraEnd);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [sample, scheduleSample]);

  return luminance;
}
