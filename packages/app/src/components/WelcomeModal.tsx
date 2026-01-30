import { useState, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus, FolderOpen } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDocumentStore, useUiStore, parseVcadFile } from "@vcad/core";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { examples } from "@/data/examples";
import type { Example } from "@/data/examples";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WelcomeModal({ open, onOpenChange }: WelcomeModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dismissWelcomeModal = useOnboardingStore((s) => s.dismissWelcomeModal);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocument = useDocumentStore((s) => s.loadDocument);
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const select = useUiStore((s) => s.select);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const incrementProjectsCreated = useOnboardingStore((s) => s.incrementProjectsCreated);

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

  function handleNewProject() {
    incrementProjectsCreated();
    const partId = addPrimitive("cube");
    select(partId);
    setTransformMode("translate");
    handleClose();
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
        handleClose();
      } catch (err) {
        console.error("Failed to parse file:", err);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleOpenExample(example: Example) {
    loadDocument(example.file);
    handleClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2",
            "border border-border bg-card shadow-2xl",
            "focus:outline-none",
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
          <div className="absolute right-3 top-3 z-10">
            <button
              onClick={handleClose}
              aria-label="Close welcome dialog"
              className="p-1 text-text-muted hover:bg-border/50 hover:text-text cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-col items-center px-8 py-9">
            {/* Header */}
            <h1 className="text-4xl font-bold tracking-tighter text-text mb-1">
              vcad<span className="text-accent">.</span>
            </h1>
            <p className="text-sm text-text-muted mb-7">free parametric cad for everyone</p>

            {/* Action buttons */}
            <div className="flex gap-3 mb-7">
              <Button
                variant="default"
                size="md"
                onClick={handleNewProject}
                className="gap-2"
              >
                <Plus size={16} weight="bold" />
                New Project
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={handleOpenFile}
                className="gap-2"
              >
                <FolderOpen size={16} />
                Open File
              </Button>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-border mb-6" />

            {/* Examples */}
            <p className="text-xs text-text-muted mb-3">Try an example:</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-2">
              {examples.map((example) => (
                <button
                  key={example.id}
                  onClick={() => handleOpenExample(example)}
                  className="text-sm text-text-muted hover:text-text"
                >
                  {example.name}
                </button>
              ))}
            </div>
          </div>

          {/* Footer with checkbox */}
          <div className="border-t border-border px-6 py-4 flex items-center justify-center">
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="accent-accent"
              />
              Don't show again
            </label>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
