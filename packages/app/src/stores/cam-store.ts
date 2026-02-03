import { create } from "zustand";

/** Tool types for CAM operations */
export type CamToolType =
  | "flat_endmill"
  | "ball_endmill"
  | "bull_endmill"
  | "vbit"
  | "drill"
  | "face_mill";

/** Tool definition */
export interface CamTool {
  id: string;
  name: string;
  type: CamToolType;
  diameter: number;
  fluteLength?: number;
  flutes?: number;
  angle?: number;
  pointAngle?: number;
  cornerRadius?: number;
  defaultRpm: number;
  defaultFeed: number;
  defaultPlunge: number;
}

/** CAM operation types */
export type CamOperationType = "face" | "pocket" | "pocket_circle" | "contour" | "roughing3d";

/** Base operation interface */
interface CamOperationBase {
  id: string;
  name: string;
  type: CamOperationType;
  toolId: string;
  depth: number;
  enabled: boolean;
}

/** Face operation */
export interface FaceOperation extends CamOperationBase {
  type: "face";
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Rectangular pocket operation */
export interface PocketOperation extends CamOperationBase {
  type: "pocket";
  x: number;
  y: number;
  width: number;
  height: number;
  stockToLeave: number;
}

/** Circular pocket operation */
export interface CircularPocketOperation extends CamOperationBase {
  type: "pocket_circle";
  centerX: number;
  centerY: number;
  radius: number;
}

/** Contour operation */
export interface ContourOperation extends CamOperationBase {
  type: "contour";
  x: number;
  y: number;
  width: number;
  height: number;
  offset: number;
  tabCount: number;
  tabWidth: number;
  tabHeight: number;
}

/** 3D Roughing operation */
export interface Roughing3DOperation extends CamOperationBase {
  type: "roughing3d";
  targetZ: number;
  topZ: number;
  stockMargin: number;
  direction: number;
  /** Part ID to rough (uses tessellated mesh) */
  partId?: string;
}

export type CamOperation =
  | FaceOperation
  | PocketOperation
  | CircularPocketOperation
  | ContourOperation
  | Roughing3DOperation;

/** Helper type to distribute Omit over union */
export type CamOperationInput =
  | Omit<FaceOperation, "id">
  | Omit<PocketOperation, "id">
  | Omit<CircularPocketOperation, "id">
  | Omit<ContourOperation, "id">
  | Omit<Roughing3DOperation, "id">;

/** CAM settings */
export interface CamSettings {
  stepover: number;
  stepdown: number;
  feedRate: number;
  plungeRate: number;
  spindleRpm: number;
  safeZ: number;
  retractZ: number;
}

/** Toolpath statistics */
export interface ToolpathStats {
  cuttingLength: number;
  estimatedTime: number;
  segmentCount: number;
  boundingBox: [[number, number, number], [number, number, number]] | null;
}

interface CamStore {
  // Panel state
  camPanelOpen: boolean;
  openCamPanel: () => void;
  closeCamPanel: () => void;

  // Tool library
  tools: CamTool[];
  selectedToolId: string | null;
  addTool: (tool: Omit<CamTool, "id">) => void;
  updateTool: (id: string, updates: Partial<CamTool>) => void;
  removeTool: (id: string) => void;
  selectTool: (id: string | null) => void;

  // Operations
  operations: CamOperation[];
  selectedOperationId: string | null;
  addOperation: (operation: CamOperationInput) => void;
  updateOperation: (id: string, updates: Partial<CamOperation>) => void;
  removeOperation: (id: string) => void;
  selectOperation: (id: string | null) => void;
  moveOperation: (id: string, direction: "up" | "down") => void;

  // Settings
  settings: CamSettings;
  setSettings: (settings: Partial<CamSettings>) => void;
  resetSettings: () => void;

  // Generation state
  isGenerating: boolean;
  generateError: string | null;
  toolpathJson: string | null;
  gcodeOutput: string | null;
  stats: ToolpathStats | null;

  setGenerating: (generating: boolean) => void;
  setGenerateError: (error: string | null) => void;
  setToolpathJson: (json: string | null) => void;
  setGcodeOutput: (gcode: string | null) => void;
  setStats: (stats: ToolpathStats | null) => void;

  // Reset all CAM state
  reset: () => void;
}

const DEFAULT_SETTINGS: CamSettings = {
  stepover: 3.0,
  stepdown: 2.0,
  feedRate: 1000.0,
  plungeRate: 300.0,
  spindleRpm: 12000.0,
  safeZ: 5.0,
  retractZ: 10.0,
};

const DEFAULT_TOOLS: CamTool[] = [
  {
    id: "default-endmill-6mm",
    name: "6mm Flat Endmill",
    type: "flat_endmill",
    diameter: 6.0,
    fluteLength: 20.0,
    flutes: 2,
    defaultRpm: 12000,
    defaultFeed: 1000,
    defaultPlunge: 300,
  },
  {
    id: "default-ball-6mm",
    name: "6mm Ball Endmill",
    type: "ball_endmill",
    diameter: 6.0,
    fluteLength: 20.0,
    flutes: 2,
    defaultRpm: 12000,
    defaultFeed: 800,
    defaultPlunge: 250,
  },
  {
    id: "default-bull-6mm",
    name: "6mm Bull Endmill R1",
    type: "bull_endmill",
    diameter: 6.0,
    cornerRadius: 1.0,
    fluteLength: 20.0,
    flutes: 2,
    defaultRpm: 12000,
    defaultFeed: 900,
    defaultPlunge: 280,
  },
  {
    id: "default-endmill-3mm",
    name: "3mm Flat Endmill",
    type: "flat_endmill",
    diameter: 3.0,
    fluteLength: 15.0,
    flutes: 2,
    defaultRpm: 18000,
    defaultFeed: 600,
    defaultPlunge: 200,
  },
  {
    id: "default-vbit-90",
    name: "90° V-Bit",
    type: "vbit",
    diameter: 6.0,
    angle: 90.0,
    defaultRpm: 15000,
    defaultFeed: 500,
    defaultPlunge: 150,
  },
];

let operationCounter = 0;

function generateOperationId(): string {
  return `op-${++operationCounter}-${Date.now()}`;
}

function generateToolId(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useCamStore = create<CamStore>((set) => ({
  // Panel state
  camPanelOpen: false,
  openCamPanel: () => set({ camPanelOpen: true }),
  closeCamPanel: () => set({ camPanelOpen: false }),

  // Tool library
  tools: DEFAULT_TOOLS,
  selectedToolId: null,
  addTool: (tool) => {
    const newTool = { ...tool, id: generateToolId() };
    set((state) => ({ tools: [...state.tools, newTool] }));
  },
  updateTool: (id, updates) => {
    set((state) => ({
      tools: state.tools.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  },
  removeTool: (id) => {
    set((state) => ({
      tools: state.tools.filter((t) => t.id !== id),
      selectedToolId: state.selectedToolId === id ? null : state.selectedToolId,
    }));
  },
  selectTool: (id) => set({ selectedToolId: id }),

  // Operations
  operations: [],
  selectedOperationId: null,
  addOperation: (operation) => {
    const id = generateOperationId();
    const newOp = { ...operation, id } as CamOperation;
    set((state) => ({
      operations: [...state.operations, newOp],
      selectedOperationId: id,
    }));
  },
  updateOperation: (id, updates) => {
    set((state) => ({
      operations: state.operations.map((op) =>
        op.id === id ? { ...op, ...updates } : op
      ) as CamOperation[],
    }));
  },
  removeOperation: (id) => {
    set((state) => ({
      operations: state.operations.filter((op) => op.id !== id),
      selectedOperationId:
        state.selectedOperationId === id ? null : state.selectedOperationId,
    }));
  },
  selectOperation: (id) => set({ selectedOperationId: id }),
  moveOperation: (id, direction) => {
    set((state) => {
      const index = state.operations.findIndex((op) => op.id === id);
      if (index === -1) return state;

      const newIndex =
        direction === "up"
          ? Math.max(0, index - 1)
          : Math.min(state.operations.length - 1, index + 1);

      if (newIndex === index) return state;

      const newOps = [...state.operations];
      [newOps[index], newOps[newIndex]] = [newOps[newIndex]!, newOps[index]!];

      return { operations: newOps };
    });
  },

  // Settings
  settings: DEFAULT_SETTINGS,
  setSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),
  resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

  // Generation state
  isGenerating: false,
  generateError: null,
  toolpathJson: null,
  gcodeOutput: null,
  stats: null,

  setGenerating: (generating) => set({ isGenerating: generating }),
  setGenerateError: (error) => set({ generateError: error }),
  setToolpathJson: (json) => set({ toolpathJson: json }),
  setGcodeOutput: (gcode) => set({ gcodeOutput: gcode }),
  setStats: (stats) => set({ stats }),

  // Reset
  reset: () =>
    set({
      operations: [],
      selectedOperationId: null,
      selectedToolId: null,
      isGenerating: false,
      generateError: null,
      toolpathJson: null,
      gcodeOutput: null,
      stats: null,
    }),
}));

/**
 * Format time in seconds to human-readable string
 */
export function formatMachiningTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Convert CamTool to WASM tool JSON format
 */
export function toolToJson(tool: CamTool): string {
  return JSON.stringify({
    type: tool.type,
    diameter: tool.diameter,
    flute_length: tool.fluteLength,
    flutes: tool.flutes,
    angle: tool.angle,
    point_angle: tool.pointAngle,
    corner_radius: tool.cornerRadius,
  });
}

/**
 * Convert CamSettings to WASM settings format
 */
export function settingsToWasm(settings: CamSettings) {
  return {
    stepover: settings.stepover,
    stepdown: settings.stepdown,
    feed_rate: settings.feedRate,
    plunge_rate: settings.plungeRate,
    spindle_rpm: settings.spindleRpm,
    safe_z: settings.safeZ,
    retract_z: settings.retractZ,
  };
}
