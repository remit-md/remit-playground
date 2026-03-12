/**
 * remit.md Playground — entry point.
 * Initialises wallets, renders layout, wires up flow controls.
 */

import { loadOrCreate, type PlaygroundWallet } from "./wallet.js";
import { ensureRegistered, requestFaucet, getBalance, BASE_URL } from "./api.js";
import { AgentPanel } from "./panels/agent.js";
import { ProviderPanel } from "./panels/provider.js";
import { ALL_FLOWS } from "./flows/index.js";
import type { Flow, StepResult, FlowContext } from "./flows/types.js";

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

async function refreshBalances(): Promise<void> {
  try {
    const [ab, pb] = await Promise.all([
      getBalance(agentWallet.address, agentWallet),
      getBalance(providerWallet.address, agentWallet),
    ]);
    agentBalanceEl.textContent = `$${ab}`;
    providerBalanceEl.textContent = `$${pb}`;
  } catch {
    // ignore
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

async function init(): Promise<void> {
  agentWallet = loadOrCreate("remit-playground-agent");
  providerWallet = loadOrCreate("remit-playground-provider");

  setStatus("Registering wallets…");
  try {
    await Promise.all([ensureRegistered(agentWallet), ensureRegistered(providerWallet)]);
  } catch (e) {
    console.warn("Registration failed:", e);
  }

  setStatus("Requesting testnet funds…");
  try {
    await Promise.all([requestFaucet(agentWallet.address), requestFaucet(providerWallet.address)]);
  } catch (e) {
    console.warn("Faucet failed:", e);
  }

  clearStatus();
  await Promise.all([checkConnectivity(), refreshBalances()]);
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
      agentPanel.addStep(step, true);
      providerPanel.addStep(step, true);
      await new Promise((r) => setTimeout(r, 600));
      agentPanel.addStep(step, false);
      providerPanel.addStep(step, false);
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
  void refreshBalances();
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
    void refreshBalances();
    return;
  }
  const step = stepQueue[stepIndex++];
  agentPanel.addStep(step);
  providerPanel.addStep(step);
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
  setStatus("Re-funding wallets…");
  try {
    await Promise.all([requestFaucet(agentWallet.address), requestFaucet(providerWallet.address)]);
  } catch {
    // ignore 429
  }
  clearStatus();
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
  root.appendChild(flowBar);

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

  root.appendChild(walletBar);

  // Flow description bar
  const descEl = el("div", "px-4 py-1 text-xs text-gray-500 bg-gray-950 border-b border-gray-800 shrink-0");
  descEl.textContent = activeFlow.description;
  root.appendChild(descEl);

  // Split panel area
  const panels = el("div", "flex flex-1 min-h-0");
  agentPanel = new AgentPanel(panels);
  providerPanel = new ProviderPanel(panels);
  root.appendChild(panels);

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

  root.appendChild(footer);
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
