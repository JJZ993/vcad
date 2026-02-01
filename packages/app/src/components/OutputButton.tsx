import { useState, useRef, useEffect } from "react";
import { CaretDown, Sparkle, Export, Check } from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import { useNotificationStore } from "@/stores/notification-store";
import {
  useOutputStore,
  type OutputAction,
  calculatePrice,
} from "@/stores/output-store";
import {
  useEngineStore,
  useDocumentStore,
  exportStlBlob,
  exportGltfBlob,
} from "@vcad/core";

interface OutputOption {
  id: OutputAction;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  badge?: string;
}

export function OutputButton() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const scene = useEngineStore((s) => s.scene);
  const parts = useDocumentStore((s) => s.parts);
  const hasParts = parts.length > 0;

  const selectedAction = useOutputStore((s) => s.selectedAction);
  const setSelectedAction = useOutputStore((s) => s.setSelectedAction);
  const openQuotePanel = useOutputStore((s) => s.openQuotePanel);
  const selectedMaterial = useOutputStore((s) => s.selectedMaterial);

  // Estimate volume for price preview (sum of all parts)
  const estimatedVolume = scene?.parts.reduce((sum, part) => {
    // Rough volume estimation from bounding box
    const positions = part.mesh.positions;
    if (!positions.length) return sum;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]!);
      maxX = Math.max(maxX, positions[i]!);
      minY = Math.min(minY, positions[i + 1]!);
      maxY = Math.max(maxY, positions[i + 1]!);
      minZ = Math.min(minZ, positions[i + 2]!);
      maxZ = Math.max(maxZ, positions[i + 2]!);
    }
    // Assume ~30% fill ratio for bounding box to volume
    const bbox = (maxX - minX) * (maxY - minY) * (maxZ - minZ);
    return sum + bbox * 0.3 / 1000; // mm³ to cm³
  }, 0) ?? 0;

  const estimatedPrice = hasParts ? calculatePrice(estimatedVolume, selectedMaterial) : null;

  const options: OutputOption[] = [
    {
      id: "manufacture",
      label: "Build",
      icon: <Sparkle size={14} weight="fill" />,
      badge: estimatedPrice ? `~$${estimatedPrice.toFixed(0)}` : undefined,
    },
    {
      id: "stl",
      label: "Export STL",
      icon: <Export size={14} />,
    },
    {
      id: "glb",
      label: "Export GLB",
      icon: <Export size={14} weight="fill" />,
    },
    {
      id: "step",
      label: "Export STEP",
      icon: <Export size={14} />,
      disabled: true, // Not yet wired up
    },
  ];

  const selectedOption = options.find((o) => o.id === selectedAction) ?? options[0]!;

  function handleExportStl() {
    if (!scene) return;
    const blob = exportStlBlob(scene);
    downloadBlob(blob, "model.stl");
    useNotificationStore.getState().addToast("Exported model.stl", "success");
  }

  function handleExportGlb() {
    if (!scene) return;
    const blob = exportGltfBlob(scene);
    downloadBlob(blob, "model.glb");
    useNotificationStore.getState().addToast("Exported model.glb", "success");
  }

  function handleManufacture() {
    // Trigger hero camera animation
    window.dispatchEvent(new CustomEvent("vcad:hero-view"));
    // Open quote panel
    openQuotePanel();
  }

  function executeAction(action: OutputAction) {
    switch (action) {
      case "manufacture":
        handleManufacture();
        break;
      case "stl":
        handleExportStl();
        break;
      case "glb":
        handleExportGlb();
        break;
      case "step":
        useNotificationStore.getState().addToast("STEP export coming soon", "info");
        break;
    }
  }

  function handlePrimaryClick() {
    executeAction(selectedAction);
  }

  function handleOptionClick(option: OutputOption) {
    if (option.disabled) return;
    setSelectedAction(option.id);
    setDropdownOpen(false);
    executeAction(option.id);
  }

  // Close dropdown on escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dropdownOpen) {
        setDropdownOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dropdownOpen]);

  const isManufacture = selectedAction === "manufacture";

  return (
    <div className="flex">
      {/* Primary action button */}
      <button
        ref={buttonRef}
        onClick={handlePrimaryClick}
        disabled={!hasParts}
        className={cn(
          "flex h-11 sm:h-8 items-center gap-1.5 px-3",
          "text-[11px] font-bold uppercase tracking-wider",
          "transition-all duration-100",
          isManufacture
            ? "bg-accent text-white hover:bg-[#d91e63]"
            : "bg-surface border border-border text-text hover:bg-hover",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "active:scale-[0.98]",
        )}
      >
        {selectedOption.icon}
        <span className="hidden sm:inline">
          {isManufacture ? "Build" : selectedOption.label}
        </span>
        <span className="sm:hidden">
          {isManufacture ? "Build" : selectedOption.label.replace("Export ", "")}
        </span>
      </button>

      {/* Dropdown trigger */}
      <Popover.Root open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <Popover.Trigger asChild>
          <button
            disabled={!hasParts}
            className={cn(
              "flex h-11 sm:h-8 w-8 sm:w-6 items-center justify-center",
              "transition-all duration-100",
              isManufacture
                ? "bg-accent text-white hover:bg-[#d91e63] border-l border-white/20"
                : "bg-surface border border-l-0 border-border text-text hover:bg-hover",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            <CaretDown
              size={12}
              className={cn(
                "transition-transform duration-200",
                dropdownOpen && "rotate-180",
              )}
            />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 w-52 border border-border bg-surface shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
            sideOffset={4}
            align="end"
          >
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleOptionClick(option)}
                disabled={option.disabled}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2.5 text-xs",
                  "transition-colors",
                  option.disabled
                    ? "text-text-muted/50 cursor-not-allowed"
                    : "text-text hover:bg-hover",
                  option.id === selectedAction && "bg-hover",
                  option.id === "manufacture" && "border-b border-border",
                )}
              >
                <span
                  className={cn(
                    option.id === "manufacture" && "text-accent",
                  )}
                >
                  {option.icon}
                </span>
                <span
                  className={cn(
                    "flex-1 text-left",
                    option.id === "manufacture" && "font-medium",
                  )}
                >
                  {option.label}
                </span>
                {option.badge && (
                  <span className="text-[10px] text-text-muted">
                    {option.badge}
                  </span>
                )}
                {option.id === selectedAction && (
                  <Check size={12} className="text-accent" />
                )}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
