import type { ReactNode } from "react";

interface AppShellProps {
  header: ReactNode;
  toolbar: ReactNode;
  sidebar: ReactNode;
  sidebarVisible?: boolean;
  properties: ReactNode;
  propertiesVisible?: boolean;
  statusBar: ReactNode;
  children: ReactNode; // viewport
}

export function AppShell({
  header,
  toolbar,
  sidebar,
  sidebarVisible = true,
  properties,
  propertiesVisible = false,
  statusBar,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg">
      {/* Header */}
      <header className="flex h-10 shrink-0 items-center border-b border-border bg-surface px-3">
        {header}
      </header>

      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center border-b border-border bg-card px-2">
        {toolbar}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        {sidebarVisible && (
          <aside className="w-56 shrink-0 overflow-hidden border-r border-border bg-surface">
            {sidebar}
          </aside>
        )}

        {/* Viewport */}
        <main className="relative flex-1 overflow-hidden">
          {children}
        </main>

        {/* Right sidebar (properties) */}
        {propertiesVisible && (
          <aside className="w-60 shrink-0 overflow-hidden border-l border-border bg-surface">
            {properties}
          </aside>
        )}
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center border-t border-border bg-surface px-3 text-xs text-text-muted">
        {statusBar}
      </footer>
    </div>
  );
}
