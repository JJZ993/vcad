import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Panel({
  children,
  className,
  side,
}: {
  children: ReactNode;
  className?: string;
  side: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "fixed top-14 bottom-4 z-20 flex w-64 flex-col overflow-hidden",
        "bg-card border border-border shadow-2xl",
        side === "left" ? "left-4" : "right-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-bold uppercase tracking-wider text-text-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 overflow-y-auto p-2", className)}>
      {children}
    </div>
  );
}
