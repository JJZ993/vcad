import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ExampleCard } from "./ExampleCard";
import { useDocumentStore } from "@/stores/document-store";
import { useUiStore } from "@/stores/ui-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { getVisibleExamples, getLockedCount } from "@/data/examples";
import type { Example } from "@/data/examples";

export function ExampleGallery() {
  const loadDocument = useDocumentStore((s) => s.loadDocument);
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const select = useUiStore((s) => s.select);
  const setTransformMode = useUiStore((s) => s.setTransformMode);

  const examplesOpened = useOnboardingStore((s) => s.examplesOpened);
  const markExampleOpened = useOnboardingStore((s) => s.markExampleOpened);
  const incrementProjectsCreated = useOnboardingStore((s) => s.incrementProjectsCreated);

  const visibleExamples = getVisibleExamples(examplesOpened);
  const lockedCount = getLockedCount(examplesOpened);

  // Group examples by difficulty
  const beginnerExamples = visibleExamples.filter((e) => e.difficulty === "beginner");
  const intermediateExamples = visibleExamples.filter((e) => e.difficulty === "intermediate");
  const advancedExamples = visibleExamples.filter((e) => e.difficulty === "advanced");

  function handleNewProject() {
    incrementProjectsCreated();
    const partId = addPrimitive("cube");
    select(partId);
    setTransformMode("translate");
  }

  function handleOpenExample(example: Example) {
    markExampleOpened(example.id);
    loadDocument(example.file);
  }

  function isNew(example: Example): boolean {
    return !examplesOpened.includes(example.id);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg">
      <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto px-6 py-8">
        <div className="flex flex-col items-center">
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
