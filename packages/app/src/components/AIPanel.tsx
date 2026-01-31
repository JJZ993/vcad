import { useState } from "react";
import { SpinnerGap, Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@vcad/core";
import { useToastStore } from "@/stores/toast-store";
import {
  FeatureGate,
  useRequireAuth,
  AuthModal,
  textToCAD,
} from "@vcad/auth";
import type { VcadFile } from "@vcad/core";

interface AIPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Panel for AI-powered CAD generation.
 * Converts natural language descriptions into vcad IR.
 */
export function AIPanel({ open, onOpenChange }: AIPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const { requireAuth, showAuth, setShowAuth, feature } = useRequireAuth("ai");

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    requireAuth(async () => {
      setLoading(true);
      try {
        const ir = await textToCAD(prompt);
        // Load the generated IR into the document
        useDocumentStore.getState().loadDocument(ir as VcadFile);
        useToastStore.getState().addToast("Generated CAD from description", "success");
        setPrompt("");
        onOpenChange(false);
      } catch (err) {
        console.error("AI generation failed:", err);
        useToastStore.getState().addToast(
          err instanceof Error ? err.message : "AI generation failed",
          "error"
        );
      } finally {
        setLoading(false);
      }
    });
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "fixed z-50 bg-surface border border-border shadow-2xl",
          "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-full max-w-md p-4",
        )}
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkle size={20} className="text-accent" />
          <h3 className="text-sm font-bold">AI Assistant</h3>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Describe what you want to create in natural language. The AI will
          generate a parametric CAD model.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Create a mounting bracket with two M3 holes, 50mm wide and 30mm tall"
          className={cn(
            "w-full h-24 p-3 text-sm",
            "bg-bg border border-border",
            "placeholder:text-text-muted/50",
            "focus:outline-none focus:border-accent",
            "resize-none",
          )}
          disabled={loading}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-xs text-text-muted hover:text-text"
            disabled={loading}
          >
            Cancel
          </button>
          <FeatureGate feature="ai">
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-xs font-bold",
                "bg-accent text-white",
                "hover:bg-accent/90",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {loading ? (
                <>
                  <SpinnerGap size={14} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkle size={14} />
                  Generate
                </>
              )}
            </button>
          </FeatureGate>
        </div>
      </div>

      <AuthModal open={showAuth} onOpenChange={setShowAuth} feature={feature} />
    </>
  );
}
