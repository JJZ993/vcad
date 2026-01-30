import { useState, useRef } from "react";
import { X, Plus, FolderOpen } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDocumentStore, useUiStore, parseVcadFile } from "@vcad/core";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { examples } from "@/data/examples";
import type { Example } from "@/data/examples";

interface InlineOnboardingProps {
  visible: boolean;
}

export function InlineOnboarding({ visible }: InlineOnboardingProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dismissWelcomeModal = useOnboardingStore((s) => s.dismissWelcomeModal);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocument = useDocumentStore((s) => s.loadDocument);
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const select = useUiStore((s) => s.select);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const incrementProjectsCreated = useOnboardingStore(
    (s) => s.incrementProjectsCreated
  );

  function handleDismiss() {
    if (dontShowAgain) {
      dismissWelcomeModal();
    }
    setDismissed(true);
  }

  function handleNewProject() {
    incrementProjectsCreated();
    const partId = addPrimitive("cube");
    select(partId);
    setTransformMode("translate");
  }

  function handleOpenFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const vcadFile = parseVcadFile(content);
        loadDocument(vcadFile);
      } catch (err) {
        console.error("Failed to parse file:", err);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleOpenExample(example: Example) {
    loadDocument(example.file);
  }

  const show = visible && !dismissed;

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center pointer-events-none",
        "transition-opacity duration-300",
        show ? "opacity-100" : "opacity-0"
      )}
    >
      <div
        className={cn(
          "relative border border-border bg-card/95 backdrop-blur-sm shadow-lg",
          "transition-all duration-300",
          show ? "scale-100 pointer-events-auto" : "scale-95 pointer-events-none"
        )}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".vcad,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Close button */}
        <div className="absolute right-2 top-2 z-10">
          <button
            onClick={handleDismiss}
            aria-label="Dismiss onboarding"
            className="p-1 text-text-muted hover:bg-border/50 hover:text-text cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col items-center px-6 py-5">
          {/* Header */}
          <h1 className="text-2xl font-bold tracking-tighter text-text mb-0.5">
            vcad<span className="text-accent">.</span>
          </h1>
          <p className="text-xs text-text-muted mb-5">
            free parametric cad for everyone
          </p>

          {/* Action buttons */}
          <div className="flex gap-2 mb-5">
            <Button
              variant="default"
              size="sm"
              onClick={handleNewProject}
              className="gap-1.5"
            >
              <Plus size={14} weight="bold" />
              New Project
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenFile}
              className="gap-1.5"
            >
              <FolderOpen size={14} />
              Open File
            </Button>
          </div>

          {/* Examples */}
          <p className="text-[10px] text-text-muted mb-2">Try an example:</p>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 max-w-xs">
            {examples.map((example) => (
              <button
                key={example.id}
                onClick={() => handleOpenExample(example)}
                className="text-xs text-text-muted hover:text-text cursor-pointer"
              >
                {example.name}
              </button>
            ))}
          </div>
        </div>

        {/* Footer with checkbox */}
        <div className="border-t border-border px-4 py-2.5 flex items-center justify-center">
          <label className="flex items-center gap-1.5 text-[10px] text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="accent-accent w-3 h-3"
            />
            Don't show again
          </label>
        </div>
      </div>
    </div>
  );
}
