/**
 * remit.md Playground — entry point.
 * Initialises wallets, renders layout, wires up flow controls.
 */

import { loadOrCreate, type PlaygroundWallet } from "./wallet.js";
import { requestFaucet, getBalance, BASE_URL } from "./api.js";
import { AgentPanel } from "./panels/agent.js";
import { ProviderPanel } from "./panels/provider.js";
import { ALL_FLOWS } from "./flows/index.js";
import type { Flow, StepResult, FlowContext } from "./flows/types.js";
import { buildReferencePage } from "./reference/index.js";
import { EventsPanel } from "./events-panel.js";

// ── State ─────────────────────────────────────────────────────────────────────

let agentWallet: PlaygroundWallet;
let providerWallet: PlaygroundWallet;
let activeFlow: Flow = ALL_FLOWS[0];
let agentPanel: AgentPanel;
let providerPanel: ProviderPanel;
let eventsPanel: EventsPanel;
let agentBalanceEl: HTMLElement;
let providerBalanceEl: HTMLElement;
let statusDotEl: HTMLElement;
let statusTextEl: HTMLElement;
let runBtn: HTMLButtonElement;
let stepBtn: HTMLButtonElement;
let resetBtn: HTMLButtonElement;

// Step-through mode
let stepQueue: StepResult[] = [];
let stepIndex = 0;

// Simulated balance tracking (dollars).
// The on-chain balance only changes for x402 (EIP-3009). All other flows use the
// server relayer's wallet, so the agent/provider on-chain balances stay flat.
// We track simulated balances so the header bar shows realistic money movement.
let agentSimBal = 0;
let providerSimBal = 0;

// ── DOM Helpers ───────────────────────────────────────────────────────────────

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(label: string, cls: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = cls;
  return b;
}

// ── Balance refresh ───────────────────────────────────────────────────────────

function formatBal(n: number): string {
  return `$${n.toFixed(2)}`;
}

async function refreshBalances(): Promise<void> {
  try {
    const [ab, pb] = await Promise.all([
      getBalance(agentWallet.address, agentWallet),
      getBalance(providerWallet.address, agentWallet),
    ]);
    agentSimBal = parseFloat(ab) || 0;
    providerSimBal = parseFloat(pb) || 0;
    agentBalanceEl.textContent = formatBal(agentSimBal);
    providerBalanceEl.textContent = formatBal(providerSimBal);
  } catch {
    // ignore
  }
}

/** Apply a step's balance delta to the simulated totals and update the header. */
function applyDelta(step: StepResult): void {
  const d = step.balanceDelta;
  if (!d) return;
  if (d.agent) {
    agentSimBal = +(agentSimBal + d.agent).toFixed(6);
    agentBalanceEl.textContent = formatBal(agentSimBal);
  }
  if (d.provider) {
    providerSimBal = +(providerSimBal + d.provider).toFixed(6);
    providerBalanceEl.textContent = formatBal(providerSimBal);
  }
}

// ── Connectivity ─────────────────────────────────────────────────────────────

async function checkConnectivity(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL.replace("/api/v0", "")}/health`);
    if (res.ok) {
      statusDotEl.className = "w-2 h-2 rounded-full bg-[#2ABFAB]";
      statusTextEl.textContent = "Base Sepolia";
    } else {
      throw new Error();
    }
  } catch {
    statusDotEl.className = "w-2 h-2 rounded-full bg-red-500";
    statusTextEl.textContent = "Disconnected";
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

const FAUCET_THRESHOLD = 10; // Only auto-faucet if balance < $10

async function init(): Promise<void> {
  agentWallet = loadOrCreate("remit-playground-agent");
  providerWallet = loadOrCreate("remit-playground-provider");

  // Fetch real balances + connectivity first
  await Promise.all([checkConnectivity(), refreshBalances()]);

  // Only faucet if either wallet is running low
  if (agentSimBal < FAUCET_THRESHOLD || providerSimBal < FAUCET_THRESHOLD) {
    setStatus("Requesting testnet funds…");
    try {
      const faucetCalls: Promise<void>[] = [];
      if (agentSimBal < FAUCET_THRESHOLD) faucetCalls.push(requestFaucet(agentWallet.address));
      if (providerSimBal < FAUCET_THRESHOLD) faucetCalls.push(requestFaucet(providerWallet.address));
      await Promise.all(faucetCalls);
    } catch (e) {
      console.warn("Faucet failed:", e);
    }
    clearStatus();
    await refreshBalances();
  }

}

function setStatus(msg: string): void {
  const statusBanner = document.getElementById("status-banner");
  if (statusBanner) {
    statusBanner.textContent = msg;
    statusBanner.classList.remove("hidden");
  }
}

function clearStatus(): void {
  const statusBanner = document.getElementById("status-banner");
  if (statusBanner) statusBanner.classList.add("hidden");
}

// ── Flow execution ────────────────────────────────────────────────────────────

function setRunning(running: boolean): void {
  runBtn.disabled = running;
  stepBtn.disabled = running;
  resetBtn.disabled = running;
}

async function runFullFlow(): Promise<void> {
  setRunning(true);
  agentPanel.clear();
  providerPanel.clear();

  const ctx: FlowContext = {
    agent: agentWallet,
    provider: providerWallet,
    emit: () => {},
  };

  try {
    for await (const step of activeFlow.run(ctx)) {
      const agentCard = agentPanel.addStep(step, true);
      const providerCard = providerPanel.addStep(step, true);
      applyDelta(step);
      if (step.variant === "webhook" && step.response) {
        const payload = step.response as Record<string, unknown>;
        if (step.side === "both") {
          eventsPanel.pushEvent(payload, "agent");
          eventsPanel.pushEvent(payload, "provider");
        } else {
          eventsPanel.pushEvent(payload, step.side);
        }
      }
      await new Promise((r) => setTimeout(r, 600));
      agentPanel.deactivateCard(agentCard);
      providerPanel.deactivateCard(providerCard);
    }
  } catch (err) {
    const errorStep: StepResult = {
      label: `Error: ${err instanceof Error ? err.message : String(err)}`,
      side: "both",
      error: err instanceof Error ? { message: err.message } : { error: String(err) },
    };
    agentPanel.addStep(errorStep);
    providerPanel.addStep(errorStep);
  }

  setRunning(false);
}

async function collectAllSteps(): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  const ctx: FlowContext = {
    agent: agentWallet,
    provider: providerWallet,
    emit: () => {},
  };
  try {
    for await (const step of activeFlow.run(ctx)) {
      steps.push(step);
    }
  } catch (err) {
    steps.push({
      label: `Error: ${err instanceof Error ? err.message : String(err)}`,
      side: "both",
      error: err instanceof Error ? { message: err.message } : { error: String(err) },
    });
  }
  return steps;
}

async function startStepMode(): Promise<void> {
  setRunning(true);
  agentPanel.clear();
  providerPanel.clear();
  stepQueue = await collectAllSteps();
  stepIndex = 0;
  setRunning(false);
  advanceStep();
}

function advanceStep(): void {
  if (stepIndex >= stepQueue.length) {
    return;
  }
  const step = stepQueue[stepIndex++];
  agentPanel.addStep(step);
  providerPanel.addStep(step);
  applyDelta(step);
  if (step.variant === "webhook" && step.response) {
    const payload = step.response as Record<string, unknown>;
    if (step.side === "both") {
      eventsPanel.pushEvent(payload, "agent");
      eventsPanel.pushEvent(payload, "provider");
    } else {
      eventsPanel.pushEvent(payload, step.side);
    }
  }
  stepBtn.textContent = stepIndex >= stepQueue.length ? "⏭ Done" : "⏭ Step";
}

async function resetFlow(): Promise<void> {
  setRunning(true);
  agentPanel.clear();
  providerPanel.clear();
  stepQueue = [];
  stepIndex = 0;
  runBtn.textContent = "▶ Run";
  stepBtn.textContent = "⏭ Step";
  // Snap simulated balances back to real on-chain values
  await refreshBalances();
  setRunning(false);
}

// ── Layout ────────────────────────────────────────────────────────────────────

function buildLayout(root: HTMLElement): void {
  // Header
  const header = el("header", "flex items-center justify-between px-4 py-3 bg-white border-b border-[#E5E3DE] shrink-0");

  const brand = el("div", "flex items-center gap-2");
  brand.appendChild(el("span", "text-lg font-bold text-black", "remit.md"));
  brand.appendChild(el("span", "text-sm text-[#6B6B6B]", "playground"));
  header.appendChild(brand);

  // Section toggle: Flows | API Reference
  const sectionToggle = el("div", "flex items-center gap-1 bg-[#F5F0EB] rounded-full p-0.5");
  const flowsTab = btn("Flows", "px-3 py-1 rounded-full text-xs font-medium bg-[#2ABFAB] text-white transition-colors");
  const refTab = btn("API Reference", "px-3 py-1 rounded-full text-xs font-medium bg-transparent text-[#6B6B6B] hover:text-black transition-colors");
  sectionToggle.appendChild(flowsTab);
  sectionToggle.appendChild(refTab);
  header.appendChild(sectionToggle);

  // Status indicator
  const statusArea = el("div", "flex items-center gap-2");
  statusDotEl = el("span", "w-2 h-2 rounded-full bg-[#6B6B6B]") as HTMLElement;
  statusTextEl = el("span", "text-xs text-[#6B6B6B]", "connecting…") as HTMLElement;
  statusArea.appendChild(statusDotEl);
  statusArea.appendChild(statusTextEl);
  header.appendChild(statusArea);
  root.appendChild(header);

  // Init banner
  const banner = el("div", "hidden text-center text-sm text-[#2ABFAB] bg-[#F0FAF8] py-2 px-4 border-b border-[#2ABFAB]/20 shrink-0");
  banner.id = "status-banner";
  root.appendChild(banner);

  // ── Flow container (everything specific to the Flows section)
  const flowContainer = el("div", "flex flex-col flex-1 min-h-0");

  // Flow selector
  const flowBar = el("div", "flex items-center gap-1 px-4 py-2 bg-white border-b border-[#E5E3DE] shrink-0 overflow-x-auto");
  const flowLabel = el("span", "text-xs text-[#6B6B6B] mr-2 shrink-0", "Flow:");
  flowBar.appendChild(flowLabel);

  for (const flow of ALL_FLOWS) {
    const pill = btn(flow.label, `shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
      flow.id === activeFlow.id
        ? "bg-[#2ABFAB] text-white"
        : "bg-[#F5F0EB] text-[#6B6B6B] hover:bg-[#EDECE8] hover:text-black"
    }`);
    pill.dataset["flowId"] = flow.id;

    pill.addEventListener("click", () => {
      activeFlow = flow;
      agentPanel.clear();
      providerPanel.clear();
      stepQueue = [];
      stepIndex = 0;
      stepBtn.textContent = "⏭ Step";
      // Update pill styles
      flowBar.querySelectorAll("button").forEach((b) => {
        b.className = `shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          b.dataset["flowId"] === flow.id
            ? "bg-[#2ABFAB] text-white"
            : "bg-[#F5F0EB] text-[#6B6B6B] hover:bg-[#EDECE8] hover:text-black"
        }`;
      });
      // Update description
      descSpan.textContent = flow.description;
    });

    flowBar.appendChild(pill);
  }
  flowContainer.appendChild(flowBar);

  // Wallet info bar
  const walletBar = el("div", "flex items-center gap-4 px-4 py-2 bg-white/60 border-b border-[#E5E3DE] text-xs shrink-0");

  const agentInfo = el("div", "flex items-center gap-2");
  agentInfo.appendChild(el("span", "text-[#2ABFAB] font-semibold", "Agent"));
  agentInfo.appendChild(el("span", "text-[#6B6B6B] font-mono", ""));  // address filled later
  agentBalanceEl = el("span", "text-black font-medium", "$…") as HTMLElement;
  agentInfo.appendChild(agentBalanceEl);
  walletBar.appendChild(agentInfo);

  walletBar.appendChild(el("span", "text-[#D4D2CC]", "·"));

  const providerInfo = el("div", "flex items-center gap-2");
  providerInfo.appendChild(el("span", "text-[#2ABFAB] font-semibold", "Provider"));
  providerInfo.appendChild(el("span", "text-[#6B6B6B] font-mono", ""));
  providerBalanceEl = el("span", "text-black font-medium", "$…") as HTMLElement;
  providerInfo.appendChild(providerBalanceEl);
  walletBar.appendChild(providerInfo);

  // Fill addresses once wallets loaded
  setTimeout(() => {
    const spans = agentInfo.querySelectorAll("span");
    if (spans[1]) spans[1].textContent = agentWallet.address.slice(0, 10) + "…";
    const pspans = providerInfo.querySelectorAll("span");
    if (pspans[1]) pspans[1].textContent = providerWallet.address.slice(0, 10) + "…";
  }, 100);

  flowContainer.appendChild(walletBar);

  // Flow description bar
  const descEl = el("div", "px-4 py-1 text-xs text-[#6B6B6B] bg-[#FAFAF7] border-b border-[#E5E3DE] shrink-0");
  const descSpan = el("span", "");
  descSpan.textContent = activeFlow.description;
  descEl.appendChild(descSpan);
  flowContainer.appendChild(descEl);

  // ── Main content: panels + drag handle + events
  const contentArea = el("div", "flex flex-col flex-1 min-h-0");

  // Agent / Provider split panels
  const panels = el("div", "flex flex-1 min-h-0");
  agentPanel = new AgentPanel(panels);
  providerPanel = new ProviderPanel(panels);
  contentArea.appendChild(panels);

  // ── Drag handle (resizable divider)
  const dragHandle = el("div", "shrink-0 cursor-row-resize group border-t border-b border-[#E5E3DE] bg-[#F5F0EB] hover:bg-[#2ABFAB]/20 transition-colors flex items-center justify-center");
  dragHandle.style.height = "6px";
  const gripDots = el("div", "w-8 h-0.5 rounded-full bg-[#D4D2CC] group-hover:bg-[#2ABFAB] transition-colors");
  dragHandle.appendChild(gripDots);
  contentArea.appendChild(dragHandle);

  // ── Events panel (bottom row)
  const eventsWrap = el("div", "shrink-0 border-t border-[#E5E3DE] overflow-hidden");
  eventsWrap.style.height = "180px"; // ~1/4 default
  eventsPanel = new EventsPanel(eventsWrap);
  contentArea.appendChild(eventsWrap);

  // ── Drag logic
  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  dragHandle.addEventListener("mousedown", (e) => {
    dragging = true;
    startY = e.clientY;
    startHeight = eventsWrap.offsetHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const delta = startY - e.clientY; // up = larger panel
    const newHeight = Math.max(48, Math.min(startHeight + delta, window.innerHeight * 0.6));
    eventsWrap.style.height = `${newHeight}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  flowContainer.appendChild(contentArea);

  // Controls footer
  const footer = el("div", "flex items-center gap-3 px-4 py-3 bg-white border-t border-[#E5E3DE] shrink-0");

  runBtn = btn("▶ Run", "px-4 py-1.5 rounded bg-[#2ABFAB] hover:bg-[#24A896] text-sm font-medium text-white transition-colors disabled:opacity-40") as HTMLButtonElement;
  stepBtn = btn("⏭ Step", "px-4 py-1.5 rounded bg-[#EDECE8] hover:bg-[#E5E3DE] text-sm font-medium text-black transition-colors disabled:opacity-40") as HTMLButtonElement;
  resetBtn = btn("↺ Reset", "px-4 py-1.5 rounded bg-[#F5F0EB] hover:bg-[#EDECE8] text-sm font-medium text-[#6B6B6B] transition-colors disabled:opacity-40") as HTMLButtonElement;

  runBtn.addEventListener("click", () => void runFullFlow());
  stepBtn.addEventListener("click", () => {
    if (stepQueue.length === 0) {
      void startStepMode();
    } else {
      advanceStep();
    }
  });
  resetBtn.addEventListener("click", () => void resetFlow());

  footer.appendChild(runBtn);
  footer.appendChild(stepBtn);
  footer.appendChild(resetBtn);

  const footerRight = el("div", "ml-auto flex items-center gap-2");
  footerRight.appendChild(el("span", "text-xs text-[#8A8A8A]", "Base Sepolia"));
  footer.appendChild(footerRight);

  flowContainer.appendChild(footer);
  root.appendChild(flowContainer);

  // ── API Reference container (hidden by default)
  const refContainer = el("div", "hidden flex-1 min-h-0 bg-[#FAFAF7]");
  let refBuilt = false;
  root.appendChild(refContainer);

  // ── Section toggle handlers
  function showFlows(): void {
    flowContainer.classList.remove("hidden");
    flowContainer.classList.add("flex", "flex-col");
    refContainer.classList.add("hidden");
    flowsTab.className = "px-3 py-1 rounded-full text-xs font-medium bg-[#2ABFAB] text-white transition-colors";
    refTab.className = "px-3 py-1 rounded-full text-xs font-medium bg-transparent text-[#6B6B6B] hover:text-black transition-colors";
  }

  function showReference(): void {
    flowContainer.classList.add("hidden");
    flowContainer.classList.remove("flex", "flex-col");
    refContainer.classList.remove("hidden");
    refTab.className = "px-3 py-1 rounded-full text-xs font-medium bg-[#2ABFAB] text-white transition-colors";
    flowsTab.className = "px-3 py-1 rounded-full text-xs font-medium bg-transparent text-[#6B6B6B] hover:text-black transition-colors";
    // Lazy-build the reference page on first view
    if (!refBuilt) {
      buildReferencePage(refContainer, agentWallet, providerWallet);
      refBuilt = true;
    }
  }

  flowsTab.addEventListener("click", showFlows);
  refTab.addEventListener("click", showReference);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const appRoot = document.getElementById("app");
if (!appRoot) throw new Error("No #app element");

// We need wallets before building layout (for addresses), so quick-load first
agentWallet = loadOrCreate("remit-playground-agent");
providerWallet = loadOrCreate("remit-playground-provider");

buildLayout(appRoot);

// Then do async init (register + faucet)
void init();
