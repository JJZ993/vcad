import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const FEATURES = [
  { title: "csg", desc: "union, difference, intersection — as operators (+, -, &)" },
  { title: "export", desc: "stl, gltf, usd, dxf, step. one model, every format." },
  { title: "inspect", desc: "volume, surface area, bounding box, center of mass" },
  { title: "transforms", desc: "mirror, linear pattern, circular pattern, translate, rotate, scale" },
  { title: "materials", desc: "pbr from toml. metallic, roughness, color, density." },
  { title: "agents", desc: "built for coding agents. api tables, cookbook, blender mcp." },
];

const WHY = [
  { title: "not openscad", desc: "no custom language. your models are real rust — cargo, crates, tests, ci." },
  { title: "native brep", desc: "built on vcad-kernel. b-rep geometry with proper boolean operations." },
  { title: "every format", desc: "stl, gltf, usd, dxf, step from one codebase. no conversion pipeline." },
  { title: "agent-native", desc: "small api, operator overloads, consistent patterns. ai agents generate models." },
];

const SHORTCUTS = [
  { keys: "W", desc: "Move tool" },
  { keys: "E", desc: "Rotate tool" },
  { keys: "R", desc: "Scale tool" },
  { keys: "Del", desc: "Delete selected" },
  { keys: "Esc", desc: "Deselect" },
  { keys: "\u2318Z", desc: "Undo" },
  { keys: "\u2318\u21E7Z", desc: "Redo" },
  { keys: "\u2318D", desc: "Duplicate" },
  { keys: "\u2318C/V", desc: "Copy / Paste" },
  { keys: "\u2318S", desc: "Save" },
  { keys: "\u2318O", desc: "Open" },
  { keys: "\u2318\u21E7U", desc: "Union (2 sel)" },
  { keys: "\u2318\u21E7D", desc: "Difference (2 sel)" },
  { keys: "\u2318\u21E7I", desc: "Intersection (2 sel)" },
  { keys: "X", desc: "Wireframe" },
  { keys: "G", desc: "Grid snap" },
  { keys: "F", desc: "Focus selection" },
  { keys: "Shift+Click", desc: "Multi-select" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

export function AboutModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
            " border border-border bg-card p-6 shadow-2xl",
            "max-h-[85vh] overflow-y-auto",
            "focus:outline-none",
          )}
        >
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-2xl font-bold tracking-tight text-text">
              vcad<span className="text-accent">.</span>
            </Dialog.Title>
            <Dialog.Close className=" p-1 text-text-muted hover:bg-border/50 hover:text-text transition-colors cursor-pointer">
              <X size={16} />
            </Dialog.Close>
          </div>

          <p className="mb-5 text-xs text-text-muted leading-relaxed">
            parametric cad for everyone. csg primitives, boolean operators, multi-format export.
            built on <a href="https://github.com/ecto/vcad/tree/main/crates/vcad-kernel" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">vcad-kernel</a>. mit licensed.
          </p>

          <div className="flex flex-col gap-5">
            {/* Install */}
            <div className=" border border-border bg-surface px-3 py-2 text-xs font-mono text-text-muted">
              <span className="text-text-muted/50">$</span> cargo add vcad
            </div>

            {/* Features */}
            <Section title="features">
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs">
                {FEATURES.map((f) => (
                  <div key={f.title}>
                    <div className="font-bold text-text">{f.title}</div>
                    <div className="text-text-muted/70 leading-relaxed">{f.desc}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Why */}
            <Section title="why vcad">
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs">
                {WHY.map((f) => (
                  <div key={f.title}>
                    <div className="font-bold text-text">{f.title}</div>
                    <div className="text-text-muted/70 leading-relaxed">{f.desc}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Keyboard shortcuts */}
            <Section title="keyboard shortcuts">
              <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs">
                {SHORTCUTS.map((s) => (
                  <div key={s.keys} className="flex items-center gap-2">
                    <kbd className="inline-flex h-5 min-w-5 items-center justify-center  border border-border bg-surface px-1.5 text-[10px] font-bold text-text-muted">
                      {s.keys}
                    </kbd>
                    <span className="text-text-muted/70">{s.desc}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Links */}
            <div className="flex gap-4 pt-1 text-xs">
              <a
                href="https://github.com/ecto/vcad"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-accent transition-colors"
              >
                github
              </a>
              <a
                href="https://crates.io/crates/vcad"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-accent transition-colors"
              >
                crates.io
              </a>
              <a
                href="https://docs.rs/vcad"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-accent transition-colors"
              >
                docs.rs
              </a>
              <a
                href="https://www.npmjs.com/package/@vcad/ir"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-accent transition-colors"
              >
                npm
              </a>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
