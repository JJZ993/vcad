import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

function round(n: number, decimals = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

interface ScrubInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}

export function ScrubInput({
  label,
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  className,
}: ScrubInputProps) {
  const [text, setText] = useState(String(round(value)));
  const [isEditing, setIsEditing] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrubStartX = useRef(0);
  const scrubStartValue = useRef(0);

  // Sync text with value when not editing
  useEffect(() => {
    if (!isEditing && !isScrubbing) {
      setText(String(round(value)));
    }
  }, [value, isEditing, isScrubbing]);

  function commit() {
    const num = parseFloat(text);
    if (!isNaN(num)) {
      const clamped = Math.max(min, Math.min(max, num));
      onChange(clamped);
    } else {
      setText(String(round(value)));
    }
    setIsEditing(false);
  }

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only scrub with left mouse button and not when editing
      if (e.button !== 0 || isEditing) return;

      e.preventDefault();
      setIsScrubbing(true);
      scrubStartX.current = e.clientX;
      scrubStartValue.current = value;

      // Try to lock pointer for unlimited travel
      try {
        (e.target as HTMLElement).requestPointerLock?.();
      } catch {
        // Pointer lock not supported or denied
      }
    },
    [isEditing, value],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isScrubbing) return;

      // Calculate delta (use movementX if pointer locked, otherwise clientX diff)
      let deltaX: number;
      if (document.pointerLockElement) {
        deltaX = e.movementX;
      } else {
        deltaX = e.clientX - scrubStartX.current;
        scrubStartX.current = e.clientX;
      }

      // Determine modifier
      let modifier = 1;
      if (e.shiftKey) modifier = 0.1; // fine
      if (e.altKey) modifier = 10; // coarse

      // Apply delta
      const delta = deltaX * step * modifier;
      const newValue = round(scrubStartValue.current + delta);
      const clamped = Math.max(min, Math.min(max, newValue));
      scrubStartValue.current = clamped;
      onChange(clamped);
    },
    [isScrubbing, step, min, max, onChange],
  );

  const handlePointerUp = useCallback(() => {
    if (!isScrubbing) return;
    setIsScrubbing(false);
    document.exitPointerLock?.();
  }, [isScrubbing]);

  // Global event listeners for scrubbing
  useEffect(() => {
    if (isScrubbing) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [isScrubbing, handlePointerMove, handlePointerUp]);

  function handleDoubleClick() {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  // Compute fill percentage for visual feedback (within typical range)
  const fillPercent = Math.max(0, Math.min(100, ((value + 100) / 200) * 100));

  return (
    <label className={cn("flex items-center gap-2 text-xs", className)}>
      <span className="w-5 shrink-0 text-text-muted font-bold">{label}</span>
      <div className="relative flex-1">
        {/* Background fill indicator */}
        <div
          className="absolute inset-y-0 left-0 bg-accent/10 transition-all pointer-events-none"
          style={{ width: `${fillPercent}%` }}
        />
        <input
          ref={inputRef}
          type="text"
          value={isEditing ? text : String(round(value))}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setText(String(round(value)));
              setIsEditing(false);
            }
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
          readOnly={!isEditing}
          className={cn(
            "w-full border border-border bg-transparent px-2 py-1 text-xs text-text outline-none focus:border-accent relative z-10",
            !isEditing && "cursor-ew-resize select-none",
            isScrubbing && "cursor-ew-resize",
          )}
        />
      </div>
    </label>
  );
}
