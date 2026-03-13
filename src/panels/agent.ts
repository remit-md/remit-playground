import { renderJsonViewer } from "../json-viewer.js";
import type { StepResult } from "../flows/types.js";

export class AgentPanel {
  private readonly el: HTMLElement;
  private readonly stepsEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "flex flex-col flex-1 min-h-0 border-r border-[#E5E3DE]";

    const header = document.createElement("div");
    header.className = "px-4 py-2 bg-white border-b border-[#E5E3DE] text-xs font-semibold text-[#2ABFAB] uppercase tracking-wider";
    header.textContent = "Agent";

    this.stepsEl = document.createElement("div");
    this.stepsEl.className = "flex-1 overflow-y-auto p-4 space-y-3";

    this.el.appendChild(header);
    this.el.appendChild(this.stepsEl);
    container.appendChild(this.el);
  }

  addStep(step: StepResult, isActive = false): HTMLElement | null {
    if (step.side === "provider") return null;

    const card = document.createElement("div");
    card.className = `step-enter rounded-lg border p-3 ${
      step.error
        ? "border-red-300 bg-red-50"
        : isActive
          ? "border-[#2ABFAB] bg-[#F0FAF8]"
          : "border-[#D4D2CC] bg-white"
    }`;

    const label = document.createElement("div");
    label.className = "text-sm font-medium text-black";
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
    card.className = "step-enter rounded-lg border p-3 border-[#D4D2CC] bg-white";
  }

  clear(): void {
    this.stepsEl.innerHTML = "";
  }
}
