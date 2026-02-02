import { useState } from "react";
import {
  CaretRight,
  CaretDown,
  SunHorizon,
  Image,
  Lightbulb,
  Sparkle,
  Camera,
  Plus,
  Trash,
  Eye,
  EyeSlash,
  Sun,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@vcad/core";
import type {
  EnvironmentPreset,
  Light,
  LightKind,
  Background,
} from "@vcad/ir";

// Available environment presets
const ENVIRONMENT_PRESETS: { value: EnvironmentPreset; label: string }[] = [
  { value: "studio", label: "Studio" },
  { value: "warehouse", label: "Warehouse" },
  { value: "apartment", label: "Apartment" },
  { value: "park", label: "Park" },
  { value: "city", label: "City" },
  { value: "dawn", label: "Dawn" },
  { value: "night", label: "Night" },
  { value: "sunset", label: "Sunset" },
  { value: "forest", label: "Forest" },
  { value: "neutral", label: "Neutral" },
];

/** Base node with expand/collapse behavior */
interface SceneNodeProps {
  icon: typeof SunHorizon;
  label: string;
  summary?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function SceneNode({
  icon: Icon,
  label,
  summary,
  children,
  defaultExpanded = false,
}: SceneNodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1 text-xs cursor-pointer rounded",
          isExpanded
            ? "bg-surface/50 text-text"
            : "text-text-muted/90 hover:bg-surface/60 hover:text-text"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="shrink-0 p-0.5 hover:bg-hover"
        >
          {isExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
        </button>
        <Icon size={14} className="shrink-0" />
        <span className="flex-1 truncate">
          {label}
          {!isExpanded && summary && (
            <span className="ml-1 text-text-muted/60 text-[10px]">{summary}</span>
          )}
        </span>
      </div>
      {isExpanded && <div className="pl-6 space-y-0.5 pb-1">{children}</div>}
    </div>
  );
}

/** Environment node with preset dropdown and intensity slider */
function EnvironmentNode() {
  const document = useDocumentStore((s) => s.document);
  const updateEnvironment = useDocumentStore((s) => s.updateEnvironment);

  const environment = document.scene?.environment ?? {
    type: "Preset" as const,
    preset: "studio" as EnvironmentPreset,
    intensity: 0.4,
  };
  const envPreset = environment.type === "Preset" ? environment.preset : "studio";
  const envIntensity = environment.intensity ?? 0.4;

  return (
    <SceneNode
      icon={SunHorizon}
      label="Environment"
      summary={envPreset}
    >
      <div className="px-2 space-y-1.5">
        <select
          value={envPreset}
          onChange={(e) =>
            updateEnvironment({
              type: "Preset",
              preset: e.target.value as EnvironmentPreset,
              intensity: envIntensity,
            })
          }
          className="w-full px-2 py-1 text-xs bg-card border border-border text-text focus:outline-none focus:border-accent"
        >
          {ENVIRONMENT_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted w-12">Intensity</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={envIntensity}
            onChange={(e) => {
              const env =
                environment.type === "Preset"
                  ? { ...environment, intensity: parseFloat(e.target.value) }
                  : environment;
              updateEnvironment(env);
            }}
            className="flex-1 h-1 bg-border rounded appearance-none cursor-pointer accent-accent"
          />
          <span className="text-[10px] text-text-muted w-6 text-right">
            {envIntensity.toFixed(1)}
          </span>
        </div>
      </div>
    </SceneNode>
  );
}

/** Helper to convert RGB array to hex color */
function rgbToHex(color: [number, number, number]): string {
  return `#${color
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

/** Helper to convert hex to RGB array */
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

/** Background node with type toggle and color pickers */
function BackgroundNode() {
  const document = useDocumentStore((s) => s.document);
  const updateBackground = useDocumentStore((s) => s.updateBackground);

  const background: Background = document.scene?.background ?? { type: "Transparent" };
  const bgType = background.type;

  function handleTypeChange(type: Background["type"]) {
    switch (type) {
      case "Environment":
        updateBackground({ type: "Environment" });
        break;
      case "Solid":
        updateBackground({ type: "Solid", color: [0.9, 0.9, 0.9] });
        break;
      case "Gradient":
        updateBackground({
          type: "Gradient",
          top: [0.15, 0.15, 0.18],
          bottom: [0.05, 0.05, 0.06],
        });
        break;
      case "Transparent":
        updateBackground({ type: "Transparent" });
        break;
    }
  }

  return (
    <SceneNode
      icon={Image}
      label="Background"
      summary={bgType === "Environment" ? "Env" : bgType}
    >
      <div className="px-2 space-y-1.5">
        <div className="flex gap-1">
          {(["Environment", "Solid", "Gradient", "Transparent"] as const).map(
            (type) => (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                className={cn(
                  "flex-1 px-1 py-1 text-[10px] border border-border",
                  bgType === type
                    ? "bg-accent text-white border-accent"
                    : "text-text hover:bg-hover"
                )}
              >
                {type === "Environment"
                  ? "Env"
                  : type === "Transparent"
                  ? "None"
                  : type.slice(0, 5)}
              </button>
            )
          )}
        </div>
        {background.type === "Solid" && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted">Color</span>
            <input
              type="color"
              value={rgbToHex(background.color)}
              onChange={(e) =>
                updateBackground({ type: "Solid", color: hexToRgb(e.target.value) })
              }
              className="w-6 h-6 border border-border cursor-pointer"
            />
          </div>
        )}
        {background.type === "Gradient" && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted">Top</span>
            <input
              type="color"
              value={rgbToHex(background.top)}
              onChange={(e) =>
                updateBackground({ ...background, top: hexToRgb(e.target.value) })
              }
              className="w-5 h-5 border border-border cursor-pointer"
            />
            <span className="text-[10px] text-text-muted">Bot</span>
            <input
              type="color"
              value={rgbToHex(background.bottom)}
              onChange={(e) =>
                updateBackground({ ...background, bottom: hexToRgb(e.target.value) })
              }
              className="w-5 h-5 border border-border cursor-pointer"
            />
          </div>
        )}
      </div>
    </SceneNode>
  );
}

/** Get icon for light kind */
function getLightIcon(kind: LightKind): typeof Sun {
  switch (kind.type) {
    case "Directional":
      return Sun;
    case "Point":
      return Lightbulb;
    case "Spot":
      return Lightbulb;
    case "Area":
      return Lightbulb;
  }
}

/** Individual light item in the list */
function LightItem({ light }: { light: Light }) {
  const updateLight = useDocumentStore((s) => s.updateLight);
  const removeLight = useDocumentStore((s) => s.removeLight);
  const [isExpanded, setIsExpanded] = useState(false);

  const Icon = getLightIcon(light.kind);
  const isEnabled = light.enabled !== false;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1 text-xs rounded",
          isExpanded ? "bg-surface/30" : "hover:bg-surface/30",
          !isEnabled && "opacity-50"
        )}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="shrink-0 p-0.5 hover:bg-hover"
        >
          {isExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
        </button>
        <Icon size={12} className="shrink-0" />
        <span className="flex-1 truncate text-text-muted">
          {light.kind.type} {light.id.slice(-4)}
        </span>
        {/* Color swatch */}
        <span
          className="w-3 h-3 rounded-full border border-border shrink-0"
          style={{
            backgroundColor: rgbToHex(light.color),
          }}
        />
        {/* Visibility toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateLight(light.id, { enabled: !isEnabled });
          }}
          className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-hover"
        >
          {isEnabled ? <Eye size={12} /> : <EyeSlash size={12} />}
        </button>
        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeLight(light.id);
          }}
          className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-hover text-text-muted hover:text-red-500"
        >
          <Trash size={12} />
        </button>
      </div>
      {isExpanded && (
        <div className="pl-6 pr-2 py-1 space-y-1.5">
          {/* Intensity */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-12">Intensity</span>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={light.intensity}
              onChange={(e) =>
                updateLight(light.id, { intensity: parseFloat(e.target.value) })
              }
              className="flex-1 h-1 bg-border rounded appearance-none cursor-pointer accent-accent"
            />
            <span className="text-[10px] text-text-muted w-6 text-right">
              {light.intensity.toFixed(1)}
            </span>
          </div>
          {/* Color */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-12">Color</span>
            <input
              type="color"
              value={rgbToHex(light.color)}
              onChange={(e) =>
                updateLight(light.id, { color: hexToRgb(e.target.value) })
              }
              className="w-6 h-6 border border-border cursor-pointer"
            />
          </div>
          {/* Shadow toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={light.castShadow ?? false}
              onChange={(e) =>
                updateLight(light.id, { castShadow: e.target.checked })
              }
              className="accent-accent"
            />
            <span className="text-[10px] text-text-muted">Cast Shadow</span>
          </label>
        </div>
      )}
    </div>
  );
}

/** Lights container node */
function LightsNode() {
  const document = useDocumentStore((s) => s.document);
  const addLight = useDocumentStore((s) => s.addLight);

  const lights = document.scene?.lights ?? [];

  function handleAddLight() {
    const newId = `light-${Date.now()}`;
    addLight({
      id: newId,
      kind: { type: "Directional", direction: { x: 0, y: -1, z: 0 } },
      color: [1, 1, 1],
      intensity: 0.5,
      enabled: true,
    });
  }

  return (
    <SceneNode
      icon={Lightbulb}
      label="Lights"
      summary={`(${lights.length})`}
    >
      <div className="space-y-0.5">
        {lights.map((light) => (
          <LightItem key={light.id} light={light} />
        ))}
        <button
          onClick={handleAddLight}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text w-full"
        >
          <Plus size={12} />
          <span>Add Light</span>
        </button>
      </div>
    </SceneNode>
  );
}

/** Post-processing node with AO and vignette controls */
function PostProcessingNode() {
  const document = useDocumentStore((s) => s.document);
  const updatePostProcessing = useDocumentStore((s) => s.updatePostProcessing);

  const postProcessing = document.scene?.postProcessing ?? {
    ambientOcclusion: { enabled: true },
    vignette: { enabled: true },
  };

  const aoEnabled = postProcessing.ambientOcclusion?.enabled ?? true;
  const aoIntensity = postProcessing.ambientOcclusion?.intensity ?? 1.5;
  const vignetteEnabled = postProcessing.vignette?.enabled ?? true;
  const vignetteDarkness = postProcessing.vignette?.darkness ?? 0.3;

  return (
    <SceneNode
      icon={Sparkle}
      label="Post-Processing"
      summary={
        aoEnabled || vignetteEnabled
          ? [aoEnabled && "AO", vignetteEnabled && "Vig"]
              .filter(Boolean)
              .join(", ")
          : "Off"
      }
    >
      <div className="px-2 space-y-2">
        {/* Ambient Occlusion */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aoEnabled}
              onChange={(e) =>
                updatePostProcessing({
                  ...postProcessing,
                  ambientOcclusion: {
                    ...postProcessing.ambientOcclusion,
                    enabled: e.target.checked,
                  },
                })
              }
              className="accent-accent"
            />
            <span className="text-[10px] text-text">Ambient Occlusion</span>
          </label>
          {aoEnabled && (
            <div className="flex items-center gap-2 pl-5 pt-1">
              <input
                type="range"
                min="0"
                max="3"
                step="0.1"
                value={aoIntensity}
                onChange={(e) =>
                  updatePostProcessing({
                    ...postProcessing,
                    ambientOcclusion: {
                      ...postProcessing.ambientOcclusion,
                      enabled: true,
                      intensity: parseFloat(e.target.value),
                    },
                  })
                }
                className="flex-1 h-1 bg-border rounded appearance-none cursor-pointer accent-accent"
              />
              <span className="text-[10px] text-text-muted w-6 text-right">
                {aoIntensity.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Vignette */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={vignetteEnabled}
              onChange={(e) =>
                updatePostProcessing({
                  ...postProcessing,
                  vignette: {
                    ...postProcessing.vignette,
                    enabled: e.target.checked,
                  },
                })
              }
              className="accent-accent"
            />
            <span className="text-[10px] text-text">Vignette</span>
          </label>
          {vignetteEnabled && (
            <div className="flex items-center gap-2 pl-5 pt-1">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={vignetteDarkness}
                onChange={(e) =>
                  updatePostProcessing({
                    ...postProcessing,
                    vignette: {
                      ...postProcessing.vignette,
                      enabled: true,
                      darkness: parseFloat(e.target.value),
                    },
                  })
                }
                className="flex-1 h-1 bg-border rounded appearance-none cursor-pointer accent-accent"
              />
              <span className="text-[10px] text-text-muted w-6 text-right">
                {vignetteDarkness.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </SceneNode>
  );
}

/** Camera presets node */
function CameraPresetsNode() {
  const document = useDocumentStore((s) => s.document);
  const removeCameraPreset = useDocumentStore((s) => s.removeCameraPreset);

  const presets = document.scene?.cameraPresets ?? [];

  function handleSaveView() {
    // Dispatch event to get current camera position
    window.dispatchEvent(new CustomEvent("vcad:save-camera-preset"));
  }

  function handleLoadPreset(presetId: string) {
    window.dispatchEvent(
      new CustomEvent("vcad:load-camera-preset", { detail: { presetId } })
    );
  }

  // Built-in presets (not stored in document)
  const builtInPresets = [
    { id: "isometric", name: "Isometric" },
    { id: "front", name: "Front" },
    { id: "top", name: "Top" },
    { id: "right", name: "Right" },
  ];

  return (
    <SceneNode
      icon={Camera}
      label="Camera"
      summary={presets.length > 0 ? `(${presets.length} saved)` : undefined}
    >
      <div className="px-2 space-y-1">
        {/* Built-in presets */}
        <div className="flex flex-wrap gap-1">
          {builtInPresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent(`vcad:camera-${preset.id}`)
                )
              }
              className="px-2 py-0.5 text-[10px] text-text-muted border border-border hover:bg-hover hover:text-text"
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* User presets */}
        {presets.length > 0 && (
          <div className="space-y-0.5 pt-1">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="group flex items-center gap-1 text-xs"
              >
                <button
                  onClick={() => handleLoadPreset(preset.id)}
                  className="flex-1 text-left px-1 py-0.5 text-text-muted hover:text-text hover:bg-hover truncate"
                >
                  {preset.name ?? `View ${preset.id.slice(-4)}`}
                </button>
                <button
                  onClick={() => removeCameraPreset(preset.id)}
                  className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500"
                >
                  <Trash size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Save current view */}
        <button
          onClick={handleSaveView}
          className="flex items-center gap-1 py-1 text-xs text-text-muted hover:text-text w-full"
        >
          <Plus size={12} />
          <span>Save Current View</span>
        </button>
      </div>
    </SceneNode>
  );
}

/** Main scene section containing all scene-related nodes */
export function SceneSection() {
  return (
    <div className="space-y-0.5 pb-2 isolation-isolate mix-blend-normal">
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted/70 px-2 pt-1">
        Scene
      </div>
      <EnvironmentNode />
      <BackgroundNode />
      <LightsNode />
      <PostProcessingNode />
      <CameraPresetsNode />
    </div>
  );
}
