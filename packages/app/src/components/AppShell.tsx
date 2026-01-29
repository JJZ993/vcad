import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode; // viewport + floating elements
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      {children}
    </div>
  );
}
