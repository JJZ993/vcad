import { useAuthStore } from "./stores/auth-store";

/**
 * Get the API base URL for server-side functions.
 */
function getApiBase(): string {
  const apiUrl =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL
      : "";
  return apiUrl || "";
}

/**
 * Text-to-CAD: Convert natural language description to vcad IR.
 *
 * @param prompt - Natural language description of the CAD model
 * @returns vcad IR document that can be loaded into the engine
 * @throws If user is not authenticated or API request fails
 *
 * @example
 * ```ts
 * const ir = await textToCAD("Create a mounting bracket with two holes");
 * loadDocument(ir);
 * ```
 */
export async function textToCAD(prompt: string): Promise<unknown> {
  const session = useAuthStore.getState().session;
  if (!session) {
    throw new Error("Authentication required for AI features");
  }

  const apiBase = getApiBase();
  const response = await fetch(`${apiBase}/api/ai/text-to-cad`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `AI request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.ir;
}

/**
 * Check if AI features are available.
 * Returns true if user is authenticated and API is configured.
 */
export function isAIAvailable(): boolean {
  const session = useAuthStore.getState().session;
  return !!session;
}
