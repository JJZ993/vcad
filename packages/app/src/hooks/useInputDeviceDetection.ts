import { useEffect, useRef } from "react";
import { useCameraSettingsStore } from "@/stores/camera-settings-store";

/**
 * Detect whether the user is using a mouse or trackpad based on wheel event characteristics.
 *
 * Detection heuristics:
 * - deltaMode === 1 (lines) → mouse (discrete scroll wheel)
 * - deltaMode === 0 (pixels) + frequent horizontal deltas → trackpad (smooth scrolling)
 * - deltaMode === 0 + small, smooth deltas → trackpad
 * - deltaMode === 0 + larger, discrete deltas → mouse with smooth scrolling enabled
 *
 * Samples multiple events before making a decision to avoid false positives.
 */
export function useInputDeviceDetection() {
  const inputDevice = useCameraSettingsStore((s) => s.inputDevice);
  const detectedDevice = useCameraSettingsStore((s) => s.detectedDevice);
  const setDetectedDevice = useCameraSettingsStore((s) => s.setDetectedDevice);

  const samplesRef = useRef<
    Array<{
      deltaMode: number;
      hasHorizontal: boolean;
      deltaY: number;
    }>
  >([]);
  const detectionDoneRef = useRef(false);

  useEffect(() => {
    // Only detect if mode is 'auto' and we haven't detected yet
    if (inputDevice !== "auto" || detectedDevice !== null) {
      detectionDoneRef.current = true;
      return;
    }

    detectionDoneRef.current = false;
    samplesRef.current = [];

    const handleWheel = (e: WheelEvent) => {
      if (detectionDoneRef.current) return;

      samplesRef.current.push({
        deltaMode: e.deltaMode,
        hasHorizontal: Math.abs(e.deltaX) > 0.5,
        deltaY: Math.abs(e.deltaY),
      });

      // Need 5 samples to make a decision
      if (samplesRef.current.length < 5) return;

      detectionDoneRef.current = true;

      const samples = samplesRef.current;

      // If any sample has deltaMode === 1 (lines), it's a mouse
      const hasLineMode = samples.some((s) => s.deltaMode === 1);
      if (hasLineMode) {
        setDetectedDevice("mouse");
        return;
      }

      // If multiple samples have horizontal scroll, it's a trackpad
      const horizontalCount = samples.filter((s) => s.hasHorizontal).length;
      if (horizontalCount >= 2) {
        setDetectedDevice("trackpad");
        return;
      }

      // Check delta patterns - mice tend to have larger, more discrete deltas
      const avgDelta =
        samples.reduce((sum, s) => sum + s.deltaY, 0) / samples.length;

      // Trackpads typically produce smaller, smoother deltas
      // Mice with smooth scrolling produce larger, more consistent deltas
      if (avgDelta < 20) {
        setDetectedDevice("trackpad");
      } else {
        setDetectedDevice("mouse");
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [inputDevice, detectedDevice, setDetectedDevice]);
}
