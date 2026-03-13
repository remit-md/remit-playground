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

// ── State ─────────────────────────────────────────────────────────────────────

let agentWallet: PlaygroundWallet;
let providerWallet: PlaygroundWallet;
let activeFlow: Flow = ALL_FLOWS[0];
let agentPanel: AgentPanel;
let providerPanel: ProviderPanel;
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
      statusDotEl.className = "w-2 h-2 rounded-full bg-green-400";
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

const FAUCET_THRESHOLD = 1; // Only auto-faucet if balance < $1

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
  // Don't refresh from on-chain here — simulated deltas are more accurate
  // than the on-chain balance (relayer model means agent's USDC doesn't move).
  // Balances reset to on-chain values on init() and resetFlow().
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
  const header = el("header", "flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0");

  const brand = el("div", "flex items-center gap-2");
  brand.appendChild(el("span", "text-lg font-bold text-white", "remit.md"));
  brand.appendChild(el("span", "text-sm text-gray-500", "playground"));
  header.appendChild(brand);

  // Section toggle: Flows | API Reference
  const sectionToggle = el("div", "flex items-center gap-1 bg-gray-800 rounded-full p-0.5");
  const flowsTab = btn("Flows", "px-3 py-1 rounded-full text-xs font-medium bg-indigo-600 text-white transition-colors");
  const refTab = btn("API Reference", "px-3 py-1 rounded-full text-xs font-medium bg-transparent text-gray-400 hover:text-gray-200 transition-colors");
  sectionToggle.appendChild(flowsTab);
  sectionToggle.appendChild(refTab);
  header.appendChild(sectionToggle);

  // Status indicator
  const statusArea = el("div", "flex items-center gap-2");
  statusDotEl = el("span", "w-2 h-2 rounded-full bg-gray-600") as HTMLElement;
  statusTextEl = el("span", "text-xs text-gray-500", "connecting…") as HTMLElement;
  statusArea.appendChild(statusDotEl);
  statusArea.appendChild(statusTextEl);
  header.appendChild(statusArea);
  root.appendChild(header);

  // Init banner
  const banner = el("div", "hidden text-center text-sm text-indigo-300 bg-indigo-950/40 py-2 px-4 border-b border-indigo-800/40 shrink-0");
  banner.id = "status-banner";
  root.appendChild(banner);

  // ── Flow container (everything specific to the Flows section)
  const flowContainer = el("div", "flex flex-col flex-1 min-h-0");

  // Flow selector
  const flowBar = el("div", "flex items-center gap-1 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0 overflow-x-auto");
  const flowLabel = el("span", "text-xs text-gray-500 mr-2 shrink-0", "Flow:");
  flowBar.appendChild(flowLabel);

  for (const flow of ALL_FLOWS) {
    const pill = btn(flow.label, `shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
      flow.id === activeFlow.id
        ? "bg-indigo-600 text-white"
        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
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
            ? "bg-indigo-600 text-white"
            : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
        }`;
      });
      // Update description
      descEl.textContent = flow.description;
    });

    flowBar.appendChild(pill);
  }
  flowContainer.appendChild(flowBar);

  // Wallet info bar
  const walletBar = el("div", "flex items-center gap-4 px-4 py-2 bg-gray-900/60 border-b border-gray-800 text-xs shrink-0");

  const agentInfo = el("div", "flex items-center gap-2");
  agentInfo.appendChild(el("span", "text-indigo-400 font-semibold", "Agent"));
  agentInfo.appendChild(el("span", "text-gray-500 font-mono", ""));  // address filled later
  agentBalanceEl = el("span", "text-white font-medium", "$…") as HTMLElement;
  agentInfo.appendChild(agentBalanceEl);
  walletBar.appendChild(agentInfo);

  walletBar.appendChild(el("span", "text-gray-700", "·"));

  const providerInfo = el("div", "flex items-center gap-2");
  providerInfo.appendChild(el("span", "text-emerald-400 font-semibold", "Provider"));
  providerInfo.appendChild(el("span", "text-gray-500 font-mono", ""));
  providerBalanceEl = el("span", "text-white font-medium", "$…") as HTMLElement;
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
  const descEl = el("div", "px-4 py-1 text-xs text-gray-500 bg-gray-950 border-b border-gray-800 shrink-0");
  descEl.textContent = activeFlow.description;
  flowContainer.appendChild(descEl);

  // Split panel area
  const panels = el("div", "flex flex-1 min-h-0");
  agentPanel = new AgentPanel(panels);
  providerPanel = new ProviderPanel(panels);
  flowContainer.appendChild(panels);

  // Controls footer
  const footer = el("div", "flex items-center gap-3 px-4 py-3 bg-gray-900 border-t border-gray-800 shrink-0");

  runBtn = btn("▶ Run", "px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors disabled:opacity-40") as HTMLButtonElement;
  stepBtn = btn("⏭ Step", "px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium text-gray-200 transition-colors disabled:opacity-40") as HTMLButtonElement;
  resetBtn = btn("↺ Reset", "px-4 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-400 transition-colors disabled:opacity-40") as HTMLButtonElement;

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
  footerRight.appendChild(el("span", "text-xs text-gray-600", "Base Sepolia"));
  footer.appendChild(footerRight);

  flowContainer.appendChild(footer);
  root.appendChild(flowContainer);

  // ── API Reference container (hidden by default)
  const refContainer = el("div", "hidden flex-1 min-h-0 bg-gray-950");
  let refBuilt = false;
  root.appendChild(refContainer);

  // ── Section toggle handlers
  function showFlows(): void {
    flowContainer.classList.remove("hidden");
    flowContainer.classList.add("flex", "flex-col");
    refContainer.classList.add("hidden");
    flowsTab.className = "px-3 py-1 rounded-full text-xs font-medium bg-indigo-600 text-white transition-colors";
    refTab.className = "px-3 py-1 rounded-full text-xs font-medium bg-transparent text-gray-400 hover:text-gray-200 transition-colors";
  }

  function showReference(): void {
    flowContainer.classList.add("hidden");
    flowContainer.classList.remove("flex", "flex-col");
    refContainer.classList.remove("hidden");
    refTab.className = "px-3 py-1 rounded-full text-xs font-medium bg-indigo-600 text-white transition-colors";
    flowsTab.className = "px-3 py-1 rounded-full text-xs font-medium bg-transparent text-gray-400 hover:text-gray-200 transition-colors";
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
