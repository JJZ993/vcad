/**
 * Camera control configuration types and presets.
 * Allows users to match muscle memory from other CAD tools.
 */

export type CameraAction = "orbit" | "pan" | "zoom" | "none";
export type InputDevice = "mouse" | "trackpad" | "auto";

export interface ModifierKeys {
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean; // Cmd on Mac, Win on Windows
  alt?: boolean;
}

export interface MouseBinding {
  button: "left" | "middle" | "right";
  modifiers?: ModifierKeys;
  action: CameraAction;
  /** Device-specific binding. Omit for universal (applies to both). */
  device?: "mouse" | "trackpad";
}

export interface ScrollBinding {
  modifiers?: ModifierKeys;
  action: CameraAction;
  /** Device-specific binding. Omit for universal (applies to both). */
  device?: "mouse" | "trackpad";
}

export interface ControlScheme {
  id: string;
  name: string;
  description: string;
  mouseBindings: MouseBinding[];
  scrollBindings: ScrollBinding[];
  /** Enable momentum on trackpad orbit (two-finger scroll) */
  trackpadOrbitEnabled: boolean;
}

export interface ZoomBehavior {
  /** Zoom toward cursor position instead of screen center */
  zoomTowardsCursor: boolean;
  /** Invert zoom direction (scroll up = zoom out) */
  invertDirection: boolean;
  /** Zoom sensitivity multiplier (0.5 to 2.0) */
  sensitivity: number;
}

export interface CameraSettings {
  /** Active control scheme preset */
  controlSchemeId: string;
  /** Input device detection mode */
  inputDevice: InputDevice;
  /** Zoom behavior options */
  zoomBehavior: ZoomBehavior;
  /** Enable orbit momentum on trackpad */
  orbitMomentum: boolean;
}

/**
 * Control scheme presets matching popular CAD applications.
 *
 * | Preset     | Scroll      | MMB    | Shift+MMB | Ctrl+MMB | RMB   |
 * |------------|-------------|--------|-----------|----------|-------|
 * | vcad       | orbit       | pan    | zoom      | -        | pan   |
 * | Fusion 360 | zoom        | orbit  | pan       | -        | -     |
 * | SolidWorks | zoom        | orbit  | -         | pan      | -     |
 * | Onshape    | zoom        | pan    | -         | -        | orbit |
 * | Blender    | zoom        | orbit  | pan       | -        | -     |
 */
export const CONTROL_PRESETS: Record<string, ControlScheme> = {
  vcad: {
    id: "vcad",
    name: "vcad (Default)",
    description: "Mouse: scroll zoom, MMB orbit. Trackpad: scroll orbit with momentum.",
    mouseBindings: [
      { button: "middle", action: "orbit", device: "mouse" },
      { button: "middle", action: "pan", device: "trackpad" },
      { button: "right", action: "orbit", device: "mouse" },
      { button: "right", action: "pan", device: "trackpad" },
    ],
    scrollBindings: [
      { action: "zoom", device: "mouse" },
      { action: "orbit", device: "trackpad" },
      { modifiers: { shift: true }, action: "zoom", device: "trackpad" },
      { modifiers: { meta: true }, action: "pan" },
    ],
    trackpadOrbitEnabled: true,
  },

  fusion360: {
    id: "fusion360",
    name: "Fusion 360",
    description: "Scroll to zoom, MMB to orbit, Shift+MMB to pan",
    mouseBindings: [
      { button: "middle", action: "orbit" },
      { button: "middle", modifiers: { shift: true }, action: "pan" },
    ],
    scrollBindings: [{ action: "zoom" }],
    trackpadOrbitEnabled: false,
  },

  solidworks: {
    id: "solidworks",
    name: "SolidWorks",
    description: "Scroll to zoom, MMB to orbit, Ctrl+MMB to pan",
    mouseBindings: [
      { button: "middle", action: "orbit" },
      { button: "middle", modifiers: { ctrl: true }, action: "pan" },
    ],
    scrollBindings: [{ action: "zoom" }],
    trackpadOrbitEnabled: false,
  },

  onshape: {
    id: "onshape",
    name: "Onshape",
    description: "Scroll to zoom, RMB to orbit, MMB to pan",
    mouseBindings: [
      { button: "right", action: "orbit" },
      { button: "middle", action: "pan" },
    ],
    scrollBindings: [{ action: "zoom" }],
    trackpadOrbitEnabled: false,
  },

  blender: {
    id: "blender",
    name: "Blender",
    description: "Scroll to zoom, MMB to orbit, Shift+MMB to pan",
    mouseBindings: [
      { button: "middle", action: "orbit" },
      { button: "middle", modifiers: { shift: true }, action: "pan" },
    ],
    scrollBindings: [{ action: "zoom" }],
    trackpadOrbitEnabled: false,
  },
};

export const DEFAULT_ZOOM_BEHAVIOR: ZoomBehavior = {
  zoomTowardsCursor: false,
  invertDirection: false,
  sensitivity: 1.0,
};

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  controlSchemeId: "vcad",
  inputDevice: "auto",
  zoomBehavior: DEFAULT_ZOOM_BEHAVIOR,
  orbitMomentum: true,
};
