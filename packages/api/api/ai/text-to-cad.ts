import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Model configuration via env vars - easy to swap providers
const MODEL_PROVIDER = process.env.AI_PROVIDER || "anthropic";
const MODEL_ID = process.env.AI_MODEL || "claude-sonnet-4-20250514";

function getModel() {
  if (MODEL_PROVIDER === "openai") {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
    return openai(MODEL_ID);
  }

  // Default: Anthropic
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });
  return anthropic(MODEL_ID);
}

const SYSTEM_PROMPT = `You are a CAD assistant for vcad, an open-source parametric CAD system.
Convert natural language descriptions into vcad IR (Intermediate Representation) JSON.

Available primitives:
- cube: { type: "cube", size: { x, y, z } }
  Origin: corner at (0,0,0), extends to (size.x, size.y, size.z)
- cylinder: { type: "cylinder", radius, height }
  Origin: base center at (0,0,0), height along +Z
- sphere: { type: "sphere", radius }
  Origin: center at (0,0,0)
- cone: { type: "cone", radius_bottom, radius_top, height }
  Origin: base center at (0,0,0), height along +Z

Available operations (applied in order):
- translate: { type: "translate", offset: { x, y, z } }
- rotate: { type: "rotate", angles: { x, y, z } } (degrees)
- scale: { type: "scale", factor: { x, y, z } }
- union: { type: "union", primitive: {...} } - add another shape
- difference: { type: "difference", primitive: {...} } - subtract another shape
- intersection: { type: "intersection", primitive: {...} } - keep only overlap
- hole: { type: "hole", diameter, at: "center" | {x, y, z} } - vertical through-hole
- linear_pattern: { type: "linear_pattern", direction: {x,y,z}, spacing, count }
- circular_pattern: { type: "circular_pattern", axis_origin: {x,y,z}, axis_dir: {x,y,z}, angle_deg, count }

Output format:
{
  "parts": [
    {
      "name": "Part Name",
      "primitive": { type: "...", ... },
      "operations": [ { type: "...", ... }, ... ],
      "material": "aluminum" | "steel" | "abs" | "pla" (optional)
    }
  ]
}

Guidelines:
- Use millimeters for all dimensions
- Keep designs simple and manufacturable
- Use meaningful part names
- Apply operations in logical order (usually: booleans, then transforms)

Respond with valid JSON only. No markdown code blocks, no explanation text.`;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Verify auth via Supabase JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Prompt required" });
    return;
  }

  if (prompt.length > 2000) {
    res.status(400).json({ error: "Prompt too long (max 2000 characters)" });
    return;
  }

  try {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 4096,
    });

    // Parse and validate JSON
    let ir: unknown;
    try {
      ir = JSON.parse(text);
    } catch {
      // Sometimes the model wraps in markdown, try to extract
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        ir = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Basic validation
    if (
      !ir ||
      typeof ir !== "object" ||
      !("parts" in ir) ||
      !Array.isArray((ir as { parts: unknown }).parts)
    ) {
      throw new Error("Invalid IR format");
    }

    res.status(200).json({ ir });
  } catch (error) {
    console.error("AI inference failed:", error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "AI inference failed",
    });
  }
}
