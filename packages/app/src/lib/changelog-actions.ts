/**
 * Execute "try it now" actions from changelog entries.
 */

import type { TryItAction } from "@vcad/core";
import { examples } from "@/data/examples";

/**
 * Execute a changelog "try it" action.
 */
export function executeChangelogAction(action: TryItAction): void {
  switch (action.type) {
    case "load-example":
      loadExample(action.exampleId);
      break;
    case "open-panel":
      openPanel(action.panel);
      break;
    case "highlight-ui":
      highlightElement(action.selector, action.tooltip);
      break;
  }
}

function loadExample(exampleId: string): void {
  const example = examples.find((e) => e.id === exampleId);
  if (example) {
    window.dispatchEvent(
      new CustomEvent("vcad:load-example", { detail: { file: example.file } })
    );
  }
}

function openPanel(panel: string): void {
  // Dispatch a generic panel open event
  window.dispatchEvent(new CustomEvent(`vcad:open-${panel}`));
}

function highlightElement(selector: string, tooltip?: string): void {
  const element = document.querySelector(selector);
  if (!element) return;

  // Add highlight class
  element.classList.add("changelog-highlight");

  // Create tooltip if provided
  let tooltipEl: HTMLElement | null = null;
  if (tooltip) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "changelog-tooltip";
    tooltipEl.textContent = tooltip;

    // Position near the element
    const rect = element.getBoundingClientRect();
    tooltipEl.style.position = "fixed";
    tooltipEl.style.top = `${rect.bottom + 8}px`;
    tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    tooltipEl.style.transform = "translateX(-50%)";
    tooltipEl.style.zIndex = "9999";

    document.body.appendChild(tooltipEl);
  }

  // Remove after 5 seconds
  setTimeout(() => {
    element.classList.remove("changelog-highlight");
    tooltipEl?.remove();
  }, 5000);
}
