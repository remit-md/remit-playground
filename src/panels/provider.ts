import { renderJsonViewer } from "../json-viewer.js";
import type { StepResult } from "../flows/types.js";

export class ProviderPanel {
  private readonly el: HTMLElement;
  private readonly stepsEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "flex flex-col flex-1 min-h-0";

    const header = document.createElement("div");
    header.className = "px-4 py-2 bg-gray-900 border-b border-gray-800 text-xs font-semibold text-emerald-400 uppercase tracking-wider";
    header.textContent = "Provider";

    this.stepsEl = document.createElement("div");
    this.stepsEl.className = "flex-1 overflow-y-auto p-4 space-y-3";

    this.el.appendChild(header);
    this.el.appendChild(this.stepsEl);
    container.appendChild(this.el);
  }

  addStep(step: StepResult, isActive = false): HTMLElement | null {
    if (step.side === "agent") return null;

    const card = document.createElement("div");
    card.className = `step-enter rounded-lg border p-3 ${
      step.error
        ? "border-red-700 bg-red-950/40"
        : isActive
          ? "border-emerald-500 bg-emerald-950/40"
          : "border-gray-700 bg-gray-900/60"
    }`;

    const label = document.createElement("div");
    label.className = "text-sm font-medium text-gray-200";
    label.textContent = step.label;
    card.appendChild(label);

    const data = step.error ?? step.response ?? step.request;
    if (data !== undefined) {
      card.appendChild(renderJsonViewer(data, true));
    }

    this.stepsEl.appendChild(card);
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return card;
  }

  /** Transition a card from active to settled state. */
  deactivateCard(card: HTMLElement | null): void {
    if (!card) return;
    card.className = "step-enter rounded-lg border p-3 border-gray-700 bg-gray-900/60";
  }

  clear(): void {
    this.stepsEl.innerHTML = "";
  }
}
