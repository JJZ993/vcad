import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExampleCard } from "./ExampleCard";
import { useDocumentStore, useUiStore } from "@vcad/core";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { getVisibleExamples, getLockedCount } from "@/data/examples";
import type { Example } from "@/data/examples";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WelcomeModal({ open, onOpenChange }: WelcomeModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dismissWelcomeModal = useOnboardingStore((s) => s.dismissWelcomeModal);

  function handleClose() {
    if (dontShowAgain) {
      dismissWelcomeModal();
    }
    onOpenChange(false);
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen && dontShowAgain) {
      dismissWelcomeModal();
    }
    onOpenChange(isOpen);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2",
            "border border-border bg-card shadow-2xl",
            "max-h-[90vh] overflow-hidden flex flex-col",
            "focus:outline-none",
          )}
        >
          {/* Close button */}
          <div className="absolute right-3 top-3 z-10">
            <button
              onClick={handleClose}
              className="p-1 text-text-muted hover:bg-border/50 hover:text-text transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Gallery content - scrollable */}
          <div className="flex-1 overflow-y-auto">
            <WelcomeGalleryContent onClose={handleClose} />
          </div>

          {/* Footer with checkbox */}
          <div className="shrink-0 border-t border-border px-6 py-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="accent-accent"
              />
              Don't show again on startup
            </label>
            <button
              onClick={handleClose}
              className="text-xs text-text-muted hover:text-text transition-colors"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WelcomeGalleryContent({ onClose }: { onClose: () => void }) {
  const loadDocument = useDocumentStore((s) => s.loadDocument);
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const select = useUiStore((s) => s.select);
  const setTransformMode = useUiStore((s) => s.setTransformMode);

  const examplesOpened = useOnboardingStore((s) => s.examplesOpened);
  const markExampleOpened = useOnboardingStore((s) => s.markExampleOpened);
  const incrementProjectsCreated = useOnboardingStore((s) => s.incrementProjectsCreated);

  const visibleExamples = getVisibleExamples(examplesOpened);
  const lockedCount = getLockedCount(examplesOpened);

  const beginnerExamples = visibleExamples.filter((e) => e.difficulty === "beginner");
  const intermediateExamples = visibleExamples.filter((e) => e.difficulty === "intermediate");
  const advancedExamples = visibleExamples.filter((e) => e.difficulty === "advanced");

  function handleNewProject() {
    incrementProjectsCreated();
    const partId = addPrimitive("cube");
    select(partId);
    setTransformMode("translate");
    onClose();
  }

  function handleOpenExample(example: Example) {
    markExampleOpened(example.id);
    loadDocument(example.file);
    onClose();
  }

  function isNew(example: Example): boolean {
    return !examplesOpened.includes(example.id);
  }

  return (
    <div className="flex flex-col items-center px-6 py-8">
      {/* Header */}
      <h1 className="text-4xl font-bold tracking-tighter text-text mb-1">
        vcad<span className="text-accent">.</span>
      </h1>
      <p className="text-sm text-text-muted mb-6">parametric cad for everyone</p>

      {/* New Project button */}
      <Button
        variant="default"
        size="lg"
        onClick={handleNewProject}
        className="gap-2 mb-8"
      >
        <Plus size={16} weight="bold" />
        New Blank Project
      </Button>

      {/* Example sections */}
      <div className="w-full space-y-6">
        {beginnerExamples.length > 0 && (
          <ExampleSection
            title="Getting Started"
            examples={beginnerExamples}
            onOpenExample={handleOpenExample}
            isNew={isNew}
          />
        )}

        {intermediateExamples.length > 0 && (
          <ExampleSection
            title="Intermediate"
            examples={intermediateExamples}
            onOpenExample={handleOpenExample}
            isNew={isNew}
          />
        )}

        {advancedExamples.length > 0 && (
          <ExampleSection
            title="Advanced"
            examples={advancedExamples}
            onOpenExample={handleOpenExample}
            isNew={isNew}
          />
        )}
      </div>

      {/* Unlock teaser */}
      {lockedCount > 0 && (
        <p className="mt-6 text-xs text-text-muted/60">
          {lockedCount} more example{lockedCount > 1 ? "s" : ""} unlock as you explore
        </p>
      )}

      {/* Links */}
      <div className="flex gap-4 text-[10px] text-text-muted/50 mt-6">
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
  );
}

interface ExampleSectionProps {
  title: string;
  examples: Example[];
  onOpenExample: (example: Example) => void;
  isNew: (example: Example) => boolean;
}

function ExampleSection({ title, examples, onOpenExample, isNew }: ExampleSectionProps) {
  return (
    <div>
      <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {examples.map((example) => (
          <ExampleCard
            key={example.id}
            example={example}
            isNew={isNew(example)}
            onClick={() => onOpenExample(example)}
          />
        ))}
      </div>
    </div>
  );
}
