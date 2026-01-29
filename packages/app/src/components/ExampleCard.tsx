import type { Example, Difficulty } from "@/data/examples";
import { cn } from "@/lib/utils";

interface ExampleCardProps {
  example: Example;
  isNew: boolean;
  onClick: () => void;
}

const difficultyColors: Record<Difficulty, string> = {
  beginner: "bg-green-500/20 text-green-400",
  intermediate: "bg-yellow-500/20 text-yellow-400",
  advanced: "bg-red-500/20 text-red-400",
};

export function ExampleCard({ example, isNew, onClick }: ExampleCardProps) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col  border border-border bg-surface hover:bg-surface-hover transition-colors text-left overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-surface-hover overflow-hidden">
        <img
          src={example.thumbnail}
          alt={example.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* NEW badge */}
        {isNew && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-bold bg-accent text-white ">
            NEW
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-3">
        {/* Header: name + difficulty */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium text-text text-sm">{example.name}</h3>
          <span
            className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium  capitalize",
              difficultyColors[example.difficulty]
            )}
          >
            {example.difficulty}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-text-muted leading-relaxed mb-2">
          {example.description}
        </p>

        {/* Feature tags */}
        <div className="flex flex-wrap gap-1">
          {example.features.map((feature) => (
            <span
              key={feature}
              className="px-1.5 py-0.5 text-[10px] bg-surface-hover text-text-muted "
            >
              {feature}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
