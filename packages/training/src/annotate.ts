/**
 * Annotation pipeline - uses LLM to generate diverse text descriptions.
 * Supports Anthropic API and local Ollama models.
 */

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway } from "@ai-sdk/gateway";
import type { GeneratedPart, TrainingExample } from "./generators/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LanguageModel = any;

/** Default Anthropic model. */
export const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

/** Default Ollama model. */
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";

/** Default gateway model - fast and cheap. */
export const DEFAULT_GATEWAY_MODEL = "anthropic/claude-3-5-haiku-latest";

/** System prompt explaining the Compact IR format. */
const SYSTEM_PROMPT = `You are describing CAD (Computer-Aided Design) mechanical parts.

The input is in "Compact IR" format - a text representation of 3D geometry:
- C x y z = Cube with dimensions x×y×z mm
- Y r h = Cylinder with radius r mm and height h mm
- S r = Sphere with radius r mm
- T n x y z = Translate node n by (x,y,z) mm
- R n x y z = Rotate node n by (x,y,z) degrees
- U a b = Union (combine) nodes a and b
- D a b = Difference (subtract b from a)

Output ONLY a brief description of the physical part (1-2 sentences max). Do NOT explain the IR format or mention "Compact IR".`;

/** Prompts for generating diverse text descriptions. */
const ANNOTATION_PROMPTS = [
  "Describe this mechanical part technically with dimensions:",
  "Describe this part as a maker/hobbyist would:",
  "What search terms would find this part?",
  "One-line manufacturing spec:",
  "What could this part be used for?",
];

/** Rate limit delay between batches (ms). */
const RATE_LIMIT_DELAY = 20;

/** Batch size for parallel API calls. */
const BATCH_SIZE = 100;

/** Max retries per request. */
const MAX_RETRIES = 5;

/** Base delay for exponential backoff (ms). */
const RETRY_BASE_DELAY = 500;

/** Split array into chunks. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an Anthropic language model.
 *
 * @param modelId - Model ID (e.g., "claude-3-5-haiku-20241022")
 * @param apiKey - Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
 */
export function createAnthropicModel(
  modelId: string = DEFAULT_MODEL,
  apiKey?: string,
): LanguageModel {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;

  if (!key) {
    throw new Error("ANTHROPIC_API_KEY environment variable not set");
  }

  const anthropic = createAnthropic({ apiKey: key });
  return anthropic(modelId);
}

/**
 * Create an Ollama language model (local).
 *
 * @param modelId - Model ID (e.g., "qwen2.5:3b", "llama3.2:3b")
 * @param baseURL - Ollama API URL (defaults to http://localhost:11434/v1)
 */
export function createOllamaModel(
  modelId: string = DEFAULT_OLLAMA_MODEL,
  baseURL: string = "http://localhost:11434/v1",
): LanguageModel {
  // Ollama exposes an OpenAI-compatible API
  const ollama = createOpenAI({
    baseURL,
    apiKey: "ollama", // Ollama doesn't need a real key
  });
  return ollama(modelId);
}

/**
 * Create a Vercel AI Gateway model.
 *
 * @param modelId - Model ID (e.g., "anthropic/claude-3-5-haiku-latest", "openai/gpt-4o-mini")
 */
export function createGatewayModel(
  modelId: string = DEFAULT_GATEWAY_MODEL,
): LanguageModel {
  return gateway(modelId);
}

/** Options for annotation. */
export interface AnnotateOptions {
  /** Language model to use. */
  model: LanguageModel;
  /** Number of prompts to use per part (1-5, default 5). */
  promptsPerPart?: number;
  /** Callback for progress updates. */
  onProgress?: (completed: number, total: number) => void;
  /** Callback for each generated example (for incremental writes). */
  onExample?: (example: TrainingExample) => void;
}

/**
 * Annotate generated parts with text descriptions using AI SDK.
 *
 * @param parts - Array of generated parts to annotate
 * @param options - Annotation options
 * @returns Array of training examples with text-IR pairs
 */
export async function annotate(
  parts: GeneratedPart[],
  options: AnnotateOptions,
): Promise<TrainingExample[]> {
  const { model, promptsPerPart = 5, onProgress, onExample } = options;

  const examples: TrainingExample[] = [];
  const prompts = ANNOTATION_PROMPTS.slice(0, promptsPerPart);
  const totalTasks = parts.length * prompts.length;
  let completed = 0;

  // Process in batches to respect rate limits
  const batches = chunk(parts, BATCH_SIZE);

  for (const batch of batches) {
    // Create all prompt-part combinations for this batch
    const tasks = batch.flatMap((part) =>
      prompts.map((prompt) => ({
        part,
        prompt: `${prompt}\n\nCompact IR:\n${part.compact}`,
      })),
    );

    // Execute API calls in parallel within batch with retry logic
    const responses = await Promise.all(
      tasks.map(async (task) => {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const response = await generateText({
              model,
              system: SYSTEM_PROMPT,
              prompt: task.prompt,
              maxOutputTokens: 150,
            });

            return { task, text: response.text.trim(), error: null };
          } catch (error) {
            const isRateLimit =
              error instanceof Error &&
              (error.message.includes("429") ||
                error.message.includes("rate") ||
                error.message.includes("Too Many"));

            if (isRateLimit && attempt < MAX_RETRIES - 1) {
              // Exponential backoff with jitter
              const delay =
                RETRY_BASE_DELAY * Math.pow(2, attempt) +
                Math.random() * 1000;
              await sleep(delay);
              continue;
            }
            return { task, text: null, error };
          }
        }
        return { task, text: null, error: new Error("Max retries exceeded") };
      }),
    );

    // Process responses
    for (const { task, text, error } of responses) {
      if (text && !error) {
        const example: TrainingExample = {
          text,
          ir: task.part.compact,
          family: task.part.family,
          complexity: task.part.complexity,
        };
        examples.push(example);
        onExample?.(example);
      }
      completed++;
      onProgress?.(completed, totalTasks);
    }

    // Rate limit delay between batches
    if (batches.indexOf(batch) < batches.length - 1) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  return examples;
}

/**
 * Generate a single synthetic description without calling the API.
 * Useful for testing or generating deterministic examples.
 */
export function generateSyntheticDescription(part: GeneratedPart): string {
  const params = part.params;

  switch (part.family) {
    case "plate": {
      const width = params.width as number;
      const depth = params.depth as number;
      const thickness = params.thickness as number;
      const pattern = params.holePattern as string;

      if (pattern === "none") {
        return `${width}x${depth}x${thickness}mm flat plate`;
      }
      const holeDiam = params.holeDiameter as number;
      return `${width}x${depth}x${thickness}mm mounting plate with ${pattern} ${holeDiam}mm holes`;
    }

    case "spacer": {
      const od = params.outerDiameter as number;
      const h = params.height as number;
      const type = params.spacerType as string;

      if (type === "solid") {
        return `${od}mm diameter ${h}mm tall standoff`;
      }
      const id = params.innerDiameter as number;
      if (type === "hollow") {
        return `${od}mm OD ${id}mm ID ${h}mm tall spacer tube`;
      }
      return `${od}mm flanged spacer ${h}mm tall`;
    }

    case "bracket": {
      const w = params.legWidth as number;
      const l1 = params.leg1Length as number;
      const l2 = params.leg2Length as number;
      const type = params.bracketType as string;
      const holes = params.hasHoles as boolean;

      let desc = `${l1}x${l2}mm L-bracket`;
      if (type === "gusseted") desc = "gusseted " + desc;
      if (holes) desc += " with mounting holes";
      return desc;
    }

    case "flange": {
      const od = params.outerDiameter as number;
      const thickness = params.thickness as number;
      const boltCount = params.boltCount as number;
      const type = params.flangeType as string;

      let desc = `${od}mm flange ${thickness}mm thick`;
      if (type === "hubbed") desc += " with hub";
      desc += ` ${boltCount}-bolt pattern`;
      return desc;
    }

    case "shaft": {
      const type = params.shaftType as string;
      const d1 = params.diameter1 as number;
      const l1 = params.length1 as number;

      if (type === "simple") {
        return `${d1}mm diameter ${l1}mm shaft`;
      }

      const d2 = params.diameter2 as number;
      const l2 = params.length2 as number;
      const hasKeyway = params.hasKeyway as boolean;

      let desc = `stepped shaft ${d1}/${d2}mm`;
      if (hasKeyway) desc += " with keyway";
      return desc;
    }

    case "enclosure": {
      const w = params.width as number;
      const d = params.depth as number;
      const h = params.height as number;
      const type = params.enclosureType as string;

      if (type === "lid") {
        return `${w}x${d}mm enclosure lid`;
      }
      let desc = `${w}x${d}x${h}mm enclosure box`;
      if (type === "boxWithStandoffs") desc += " with standoffs";
      if (type === "boxWithVents") desc += " with vents";
      return desc;
    }

    case "mount": {
      const type = params.mountType as string;
      const w = params.plateWidth as number;
      const h = params.plateHeight as number;

      if (type === "nema17") return "NEMA 17 motor mount plate";
      if (type === "nema23") return "NEMA 23 motor mount plate";
      if (type === "sensor") {
        const sd = params.sensorDiameter as number;
        return `${sd}mm sensor mount bracket`;
      }
      return `${w}x${h}mm adjustable mount plate`;
    }

    default:
      return `${part.family} part`;
  }
}

/**
 * Generate training examples without API calls using synthetic descriptions.
 * Useful for testing or when API access is not available.
 */
export function generateSyntheticExamples(
  parts: GeneratedPart[],
): TrainingExample[] {
  return parts.map((part) => ({
    text: generateSyntheticDescription(part),
    ir: part.compact,
    family: part.family,
    complexity: part.complexity,
  }));
}
