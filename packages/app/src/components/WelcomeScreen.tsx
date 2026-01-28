import { Cube, Cylinder, Globe } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/stores/document-store";
import { useUiStore } from "@/stores/ui-store";
import type { PrimitiveKind } from "@/types";

const QUICK_ADD: { kind: PrimitiveKind; icon: typeof Cube; label: string }[] = [
  { kind: "cube", icon: Cube, label: "Box" },
  { kind: "cylinder", icon: Cylinder, label: "Cylinder" },
  { kind: "sphere", icon: Globe, label: "Sphere" },
];

const FEATURES = [
  { title: "csg", desc: "union, difference, intersection — as operators (+, -, &)" },
  { title: "export", desc: "stl, gltf, usd, dxf, step. one model, every format." },
  { title: "inspect", desc: "volume, surface area, bounding box, center of mass" },
  { title: "transforms", desc: "mirror, linear pattern, circular pattern, translate, rotate, scale" },
  { title: "materials", desc: "pbr from toml. metallic, roughness, color, density." },
  { title: "agents", desc: "built for coding agents. api tables, cookbook, blender mcp." },
];

export function WelcomeScreen() {
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const select = useUiStore((s) => s.select);
  const setTransformMode = useUiStore((s) => s.setTransformMode);

  function handleAdd(kind: PrimitiveKind) {
    const partId = addPrimitive(kind);
    select(partId);
    setTransformMode("translate");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md px-6">
        <div className="flex flex-col items-center text-center">
          {/* Logo */}
          <h1 className="text-5xl font-bold tracking-tighter text-text mb-1">
            vcad<span className="text-accent">.</span>
          </h1>
          <p className="text-sm text-text-muted mb-1">parametric cad in rust</p>
          <p className="text-xs text-text-muted/70 mb-6 max-w-xs leading-relaxed">
            csg primitives, boolean operators, multi-format export. built on vcad-kernel. mit licensed.
          </p>

          {/* Quick add */}
          <div className="flex gap-2 mb-8">
            {QUICK_ADD.map(({ kind, icon: Icon, label }) => (
              <Button
                key={kind}
                variant="outline"
                size="md"
                onClick={() => handleAdd(kind)}
                className="gap-2"
              >
                <Icon size={14} />
                {label}
              </Button>
            ))}
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-left text-xs mb-6">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="font-bold text-text">{f.title}</div>
                <div className="text-text-muted/70 leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Links */}
          <div className="flex gap-4 text-[10px] text-text-muted/50">
            <a
              href="https://github.com/ecto/vcad"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-muted transition-colors"
            >
              github
            </a>
            <a
              href="https://crates.io/crates/vcad"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-muted transition-colors"
            >
              crates.io
            </a>
            <a
              href="https://docs.rs/vcad"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-muted transition-colors"
            >
              docs.rs
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
