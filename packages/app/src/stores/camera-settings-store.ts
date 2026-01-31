import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type CameraSettings,
  type InputDevice,
  type ZoomBehavior,
  DEFAULT_CAMERA_SETTINGS,
  CONTROL_PRESETS,
} from "@/types/camera-controls";

interface CameraSettingsState extends CameraSettings {
  /** Detected input device (only used when inputDevice is 'auto') */
  detectedDevice: "mouse" | "trackpad" | null;

  // Actions
  setControlScheme: (schemeId: string) => void;
  setInputDevice: (device: InputDevice) => void;
  setDetectedDevice: (device: "mouse" | "trackpad") => void;
  setZoomBehavior: (behavior: Partial<ZoomBehavior>) => void;
  setOrbitMomentum: (enabled: boolean) => void;
  resetToDefaults: () => void;
}

export const useCameraSettingsStore = create<CameraSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_CAMERA_SETTINGS,
      detectedDevice: null,

      setControlScheme: (schemeId: string) => {
        if (CONTROL_PRESETS[schemeId]) {
          set({ controlSchemeId: schemeId });
        }
      },

      setInputDevice: (device: InputDevice) => {
        set({ inputDevice: device });
      },

      setDetectedDevice: (device: "mouse" | "trackpad") => {
        set({ detectedDevice: device });
      },

      setZoomBehavior: (behavior: Partial<ZoomBehavior>) => {
        set((state) => ({
          zoomBehavior: { ...state.zoomBehavior, ...behavior },
        }));
      },

      setOrbitMomentum: (enabled: boolean) => {
        set({ orbitMomentum: enabled });
      },

      resetToDefaults: () => {
        set({
          ...DEFAULT_CAMERA_SETTINGS,
          detectedDevice: null,
        });
      },
    }),
    {
      name: "vcad-camera-settings",
      partialize: (state) => ({
        controlSchemeId: state.controlSchemeId,
        inputDevice: state.inputDevice,
        zoomBehavior: state.zoomBehavior,
        orbitMomentum: state.orbitMomentum,
      }),
    },
  ),
);

/**
 * Get the effective input device, resolving 'auto' to detected device.
 */
export function getEffectiveInputDevice(
  state: CameraSettingsState,
): "mouse" | "trackpad" {
  if (state.inputDevice === "auto") {
    return state.detectedDevice ?? "trackpad"; // Default to trackpad if not yet detected
  }
  return state.inputDevice;
}

/**
 * Get the active control scheme.
 */
export function getActiveControlScheme(state: CameraSettingsState) {
  return CONTROL_PRESETS[state.controlSchemeId] ?? CONTROL_PRESETS.vcad!;
}

export type { CameraSettingsState };
