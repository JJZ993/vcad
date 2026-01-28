import { Canvas } from "@react-three/fiber";
import { ViewportContent } from "./ViewportContent";
import { useUiStore } from "@/stores/ui-store";
import { useTheme } from "@/hooks/useTheme";

const BG_DARK = "#0f172a";
const BG_LIGHT = "#f1f5f9";

export function Viewport() {
  const clearSelection = useUiStore((s) => s.clearSelection);
  const { isDark } = useTheme();

  return (
    <div className="fixed inset-0">
      <Canvas
        camera={{ position: [50, 50, 50], fov: 50, near: 0.1, far: 10000 }}
        onPointerMissed={() => clearSelection()}
        gl={{ antialias: true }}
        style={{ background: isDark ? BG_DARK : BG_LIGHT }}
      >
        <ViewportContent />
      </Canvas>
    </div>
  );
}
