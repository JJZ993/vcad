/**
 * Camera control utility functions.
 * Match input events to camera actions based on control scheme bindings.
 */

import type {
  CameraAction,
  ControlScheme,
  ModifierKeys,
  MouseBinding,
  ScrollBinding,
} from "@/types/camera-controls";

/**
 * Check if modifier keys match a binding's requirements.
 * A binding with no modifiers matches when no modifiers are pressed.
 * A binding with specific modifiers requires exactly those modifiers.
 */
function modifiersMatch(
  required: ModifierKeys | undefined,
  actual: ModifierKeys,
): boolean {
  const r = required ?? {};
  return (
    (r.shift ?? false) === (actual.shift ?? false) &&
    (r.ctrl ?? false) === (actual.ctrl ?? false) &&
    (r.meta ?? false) === (actual.meta ?? false) &&
    (r.alt ?? false) === (actual.alt ?? false)
  );
}

/**
 * Get modifier keys from a DOM event.
 */
export function getModifiersFromEvent(
  e: MouseEvent | WheelEvent,
): ModifierKeys {
  return {
    shift: e.shiftKey,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    alt: e.altKey,
  };
}

/**
 * Convert DOM mouse button number to binding button name.
 */
function buttonFromNumber(button: number): MouseBinding["button"] | null {
  switch (button) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    default:
      return null;
  }
}

/**
 * Find the camera action for a scroll event.
 * Returns the action from the first matching binding, or 'none' if no match.
 *
 * Bindings are checked in order - more specific bindings (with modifiers)
 * should be listed before less specific ones.
 */
export function matchScrollBinding(
  bindings: ScrollBinding[],
  modifiers: ModifierKeys,
): CameraAction {
  // Sort bindings by specificity: more modifiers = higher priority
  const sortedBindings = [...bindings].sort((a, b) => {
    const countMods = (m: ModifierKeys | undefined) =>
      Object.values(m ?? {}).filter(Boolean).length;
    return countMods(b.modifiers) - countMods(a.modifiers);
  });

  for (const binding of sortedBindings) {
    if (modifiersMatch(binding.modifiers, modifiers)) {
      return binding.action;
    }
  }
  return "none";
}

/**
 * Find the camera action for a mouse button event.
 * Returns the action from the first matching binding, or 'none' if no match.
 */
export function matchMouseBinding(
  bindings: MouseBinding[],
  button: number,
  modifiers: ModifierKeys,
): CameraAction {
  const buttonName = buttonFromNumber(button);
  if (!buttonName) return "none";

  // Sort bindings by specificity: more modifiers = higher priority
  const sortedBindings = [...bindings].sort((a, b) => {
    const countMods = (m: ModifierKeys | undefined) =>
      Object.values(m ?? {}).filter(Boolean).length;
    return countMods(b.modifiers) - countMods(a.modifiers);
  });

  for (const binding of sortedBindings) {
    if (
      binding.button === buttonName &&
      modifiersMatch(binding.modifiers, modifiers)
    ) {
      return binding.action;
    }
  }
  return "none";
}

/**
 * Convert control scheme mouse bindings to Three.js OrbitControls mouseButtons config.
 * Returns the MOUSE enum values for LEFT, MIDDLE, RIGHT buttons.
 */
export function getOrbitControlsMouseButtons(
  scheme: ControlScheme,
): {
  LEFT: number | undefined;
  MIDDLE: number | undefined;
  RIGHT: number | undefined;
} {
  // Three.js MOUSE constants
  const MOUSE = { ROTATE: 0, DOLLY: 1, PAN: 2 };

  const actionToMouse = (action: CameraAction): number | undefined => {
    switch (action) {
      case "orbit":
        return MOUSE.ROTATE;
      case "zoom":
        return MOUSE.DOLLY;
      case "pan":
        return MOUSE.PAN;
      default:
        return undefined;
    }
  };

  // Find actions for each button (without modifiers)
  const getButtonAction = (button: "left" | "middle" | "right") => {
    const binding = scheme.mouseBindings.find(
      (b) =>
        b.button === button &&
        !b.modifiers?.shift &&
        !b.modifiers?.ctrl &&
        !b.modifiers?.meta &&
        !b.modifiers?.alt,
    );
    return binding?.action ?? "none";
  };

  return {
    LEFT: actionToMouse(getButtonAction("left")),
    MIDDLE: actionToMouse(getButtonAction("middle")),
    RIGHT: actionToMouse(getButtonAction("right")),
  };
}
