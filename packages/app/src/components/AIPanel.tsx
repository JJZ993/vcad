import { useState, useEffect } from "react";
import { SpinnerGap, Sparkle, CloudArrowDown, Desktop, Warning } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@vcad/core";
import { useNotificationStore } from "@/stores/notification-store";
import { fromCompact, type Document } from "@vcad/ir";
import type { VcadFile } from "@vcad/core";
import {
  generateCAD,
  getInferenceStatus,
  type ProgressCallback,
} from "@/lib/browser-inference";
import { generateCADServer, checkServerHealth } from "@/lib/server-inference";

interface AIPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Inference mode selection. */
type InferenceMode = "browser" | "server" | "auto";

/**
 * Panel for AI-powered CAD generation.
 * Converts natural language descriptions into vcad IR.
 *
 * Supports two inference modes:
 * - Browser: Uses local inference with Transformers.js (no auth required)
 * - Server: Uses authenticated API endpoint (requires sign-in)
 */
export function AIPanel({ open, onOpenChange }: AIPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  // Default to server since cad0-mini isn't published yet
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>("server");
  const [browserAvailable, setBrowserAvailable] = useState(true);
  const [modelStatus, setModelStatus] = useState<{
    loaded: boolean;
    cached: boolean;
    webgpu: boolean;
    size: number;
  } | null>(null);

  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);

  // Check browser and server inference availability on mount
  useEffect(() => {
    if (open) {
      // Check browser inference
      getInferenceStatus()
        .then((status) => {
          setModelStatus({
            loaded: status.modelLoaded,
            cached: status.modelCached,
            webgpu: status.webgpuAvailable,
            size: status.estimatedModelSize,
          });
          setBrowserAvailable(true);
        })
        .catch(() => {
          setBrowserAvailable(false);
        });

      // Check server inference
      checkServerHealth().then(setServerAvailable);
    }
  }, [open]);

  // Determine effective inference mode
  // Note: Browser mode (cad0-mini) not available until distillation is complete
  const effectiveMode: "browser" | "server" = (() => {
    if (inferenceMode === "server") return "server";
    if (inferenceMode === "browser" && browserAvailable) return "browser";
    // Auto/default: use server (cad0-mini not published yet)
    return "server";
  })();

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setLoadingStatus("Initializing...");
    setLoadingProgress(0);
    onOpenChange(false); // Close panel immediately

    const store = useNotificationStore.getState();

    // Determine stages based on mode
    const stages = effectiveMode === "browser"
      ? ["Loading AI model", "Parsing intent", "Generating geometry", "Validating mesh"]
      : ["Connecting to server", "Generating geometry", "Validating mesh"];

    const progressId = store.startAIOperation(prompt, stages);

    try {
      let document: Document;

      if (effectiveMode === "browser") {
        // Browser-based inference
        const progressCallback: ProgressCallback = (loaded, total, status) => {
          const pct = Math.round((loaded / total) * 100);
          setLoadingProgress(pct);
          setLoadingStatus(status);

          // Update notification progress
          if (status.includes("Loading") || status.includes("Initializing")) {
            store.updateAIProgress(progressId, 0, Math.min(pct, 30));
          } else if (status.includes("Generating") || status.includes("Processing")) {
            store.updateAIProgress(progressId, 2, 30 + Math.min(pct * 0.5, 50));
          }
        };

        setLoadingStatus("Loading AI model...");
        store.updateAIProgress(progressId, 0, 5);

        const result = await generateCAD(prompt, undefined, progressCallback);

        setLoadingStatus("Parsing generated IR...");
        store.updateAIProgress(progressId, 3, 90);

        // Parse the Compact IR to a Document
        try {
          document = fromCompact(result.ir);
        } catch (parseError) {
          console.error("Failed to parse generated IR:", result.ir);
          throw new Error("Generated invalid CAD code. Please try rephrasing your description.");
        }

        // Complete with result
        store.completeAIOperation(progressId, {
          type: "success",
          title: "Generated locally",
          description: `Created in ${(result.durationMs / 1000).toFixed(1)}s`,
          actions: [
            {
              label: "Undo",
              onClick: () => useDocumentStore.getState().undo(),
              variant: "secondary",
            },
          ],
        });
      } else {
        // Server-based inference (cad0 on Modal)
        setLoadingStatus("Connecting to server...");
        store.updateAIProgress(progressId, 0, 10);

        setLoadingStatus("Generating geometry...");
        store.updateAIProgress(progressId, 1, 30);

        const result = await generateCADServer(prompt, {
          temperature: 0.1,
          maxTokens: 128,
        });

        store.updateAIProgress(progressId, 1, 80);

        setLoadingStatus("Parsing generated IR...");
        store.updateAIProgress(progressId, 2, 90);

        // Parse the Compact IR to a Document
        try {
          document = fromCompact(result.ir);
        } catch (parseError) {
          console.error("Failed to parse generated IR:", result.ir);
          throw new Error("Generated invalid CAD code. Please try rephrasing your description.");
        }

        store.completeAIOperation(progressId, {
          type: "success",
          title: "Generated from server",
          description: `Created in ${(result.durationMs / 1000).toFixed(1)}s (${result.tokens} tokens)`,
          actions: [
            {
              label: "Undo",
              onClick: () => useDocumentStore.getState().undo(),
              variant: "secondary",
            },
          ],
        });
      }

      // Load the generated document
      // Wrap Document in VcadFile format expected by loadDocument
      const vcadFile: VcadFile = {
        document,
        parts: [],
        nextNodeId: Object.keys(document.nodes).length,
        nextPartNum: 1,
      };
      useDocumentStore.getState().loadDocument(vcadFile);
      setPrompt("");
    } catch (err) {
      console.error("AI generation failed:", err);
      store.failAIOperation(
        progressId,
        err instanceof Error ? err.message : "AI generation failed"
      );
    } finally {
      setLoading(false);
      setLoadingStatus("");
      setLoadingProgress(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  if (!open) return null;

  const modelSizeMB = modelStatus ? Math.round(modelStatus.size / 1024 / 1024) : 350;
  const showModelDownloadWarning = effectiveMode === "browser" && !modelStatus?.loaded && !modelStatus?.cached;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => !loading && onOpenChange(false)}
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
          {modelStatus?.webgpu && effectiveMode === "browser" && (
            <span className="ml-auto text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded">
              WebGPU
            </span>
          )}
        </div>

        <p className="text-xs text-text-muted mb-4">
          Describe what you want to create in natural language. The AI will
          generate a parametric CAD model.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Create a mounting bracket with two M3 holes, 50mm wide and 30mm tall"
          className={cn(
            "w-full h-24 p-3 text-sm",
            "bg-bg border border-border",
            "placeholder:text-text-muted/50",
            "focus:outline-none focus:border-accent",
            "resize-none",
          )}
          disabled={loading}
          autoFocus
        />

        {/* Inference mode selector */}
        <div className="flex items-center gap-2 mt-3 mb-2">
          <span className="text-xs text-text-muted">Mode:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setInferenceMode("auto")}
              disabled={loading}
              className={cn(
                "px-2 py-1 text-[10px] rounded transition-colors",
                inferenceMode === "auto"
                  ? "bg-accent text-white"
                  : "bg-bg text-text-muted hover:text-text"
              )}
            >
              Auto
            </button>
            <button
              onClick={() => setInferenceMode("browser")}
              disabled={true} // cad0-mini not published yet
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors",
                inferenceMode === "browser"
                  ? "bg-accent text-white"
                  : "bg-bg text-text-muted hover:text-text",
                "opacity-50 cursor-not-allowed"
              )}
              title="Coming soon: local browser inference"
            >
              <Desktop size={10} />
              Local
            </button>
            <button
              onClick={() => setInferenceMode("server")}
              disabled={loading || serverAvailable === false}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors",
                inferenceMode === "server"
                  ? "bg-accent text-white"
                  : "bg-bg text-text-muted hover:text-text",
                serverAvailable === false && "opacity-50 cursor-not-allowed"
              )}
              title={serverAvailable === false ? "Server unavailable" : "Uses cad0 (7B model)"}
            >
              <CloudArrowDown size={10} />
              Server
            </button>
          </div>
        </div>

        {/* Model download warning (browser mode) */}
        {showModelDownloadWarning && (
          <div className="flex items-start gap-2 p-2 mb-3 text-xs bg-warning/10 border border-warning/20 rounded">
            <Warning size={14} className="text-warning mt-0.5 shrink-0" />
            <span className="text-text-muted">
              First use will download ~{modelSizeMB}MB model. Subsequent uses are instant.
            </span>
          </div>
        )}

        {/* Server cold start warning */}
        {effectiveMode === "server" && (
          <div className="flex items-start gap-2 p-2 mb-3 text-xs bg-surface-hover border border-border rounded">
            <CloudArrowDown size={14} className="text-text-muted mt-0.5 shrink-0" />
            <span className="text-text-muted">
              First request may take ~30s (cold start). Subsequent requests are faster.
            </span>
          </div>
        )}

        {/* Loading progress */}
        {loading && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-text-muted mb-1">
              <span>{loadingStatus}</span>
              {loadingProgress > 0 && loadingProgress < 100 && (
                <span>{loadingProgress}%</span>
              )}
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-4">
          <span className="text-[10px] text-text-muted">
            {effectiveMode === "browser"
              ? "Local: cad0-mini (0.5B)"
              : "Server: cad0 (7B)"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-xs text-text-muted hover:text-text"
              disabled={loading}
            >
              Cancel
            </button>
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
                  {loadingStatus || "Generating..."}
                </>
              ) : (
                <>
                  <Sparkle size={14} />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[10px] text-text-muted">
            Press <kbd className="px-1 py-0.5 bg-bg border border-border rounded text-[9px]">⌘</kbd>+<kbd className="px-1 py-0.5 bg-bg border border-border rounded text-[9px]">Enter</kbd> to generate
          </p>
        </div>
      </div>
    </>
  );
}
