import { useDocumentStore, useUiStore, useEngineStore } from "@vcad/core";

export function StatusBar() {
  const parts = useDocumentStore((s) => s.parts);
  const loading = useEngineStore((s) => s.loading);
  const error = useEngineStore((s) => s.error);
  const gridSnap = useUiStore((s) => s.gridSnap);
  const snapIncrement = useUiStore((s) => s.snapIncrement);

  const partCount = parts.length;

  let status = "Ready";
  if (loading) status = "Evaluating...";
  if (error) status = "Error";

  return (
    <>
      {/* Left side: status and part count */}
      <span className={error ? "text-danger" : ""}>{status}</span>
      {partCount > 0 && (
        <>
          <span className="mx-2 text-border">·</span>
          <span>{partCount} part{partCount !== 1 ? "s" : ""}</span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: units and snap */}
      <span className="text-text-muted/70">mm</span>
      <span className="mx-2 text-border">·</span>
      <span className={gridSnap ? "text-accent" : "text-text-muted/70"}>
        snap {gridSnap ? `${snapIncrement}mm` : "off"}
      </span>
    </>
  );
}
