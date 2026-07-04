"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { connectWallet, encryptAndSubmitSignal, getRuntimeStatus } from "@/lib/fhenixClient";
import {
  applySignalToAggregate,
  defaultSimulatorAggregate,
  deriveSimulatorAnalytics,
  readStoredSimulatorAggregate,
  writeStoredSimulatorAggregate
} from "@/lib/simulatorState";
import type { SimulatorAggregate } from "@/lib/simulatorState";
import type { Cohort, NetworkStatus, SignalFormValues, WalletState } from "@/lib/types";
import { cohorts } from "@/lib/types";

type SourceKind = "Public" | "Encrypted Aggregate" | "Live Fhenix" | "Mixed";

type CipherReceipt = {
  id: string;
  handle: string;
  mode: "browser-encrypted" | "live-fhenix";
  txHash?: string;
};

const emptyRuntime: NetworkStatus = {
  walletConnected: false,
  rpcConfigured: false,
  fhenixSdkLoaded: false,
  liveModeAvailable: false,
  contractConfigured: false,
  liveReady: false,
  statusText: "Not connected",
  networkLabel: "Ethereum Sepolia",
  message: "Connect wallet to enable live Fhenix transaction mode."
};

const defaultSignal: SignalFormValues = {
  cohort: "Contributors",
  activityAmount: 540,
  riskScore: 38,
  daoVote: "yes",
  kpiValue: 58
};

export default function SimulatorPage() {
  const [aggregate, setAggregate] = useState<SimulatorAggregate>(() => readStoredSimulatorAggregate());
  const [signal, setSignal] = useState<SignalFormValues>(defaultSignal);
  const [wallet, setWallet] = useState<WalletState>({ connected: false });
  const [runtime, setRuntime] = useState<NetworkStatus>(emptyRuntime);
  const [receipts, setReceipts] = useState<CipherReceipt[]>([
    { id: "snapshot-030", handle: "0x9f72...fhe030", mode: "browser-encrypted" }
  ]);
  const [status, setStatus] = useState("Private snapshot loaded. Add encrypted signals to watch aggregates move.");
  const [busy, setBusy] = useState(false);

  const analytics = useMemo(() => deriveSimulatorAnalytics(aggregate), [aggregate]);

  function commitAggregate(next: SimulatorAggregate, message = "Simulation controls updated. Main dashboard will reflect this snapshot.") {
    setAggregate(next);
    writeStoredSimulatorAggregate(next);
    setStatus(message);
  }

  async function handleConnect() {
    const nextWallet = await connectWallet();
    setWallet(nextWallet);
    setRuntime(await getRuntimeStatus(nextWallet));
    setStatus(nextWallet.connected ? "Wallet connected. Live Fhenix transaction mode is available when the adapter is ready." : "Wallet provider unavailable.");
  }

  async function submitLocalEncryptedSignal() {
    setBusy(true);
    setStatus("Encrypting private signal in browser...");
    try {
      const handle = await encryptForDemo(signal, aggregate.encryptedSignals + 1);
      setAggregate((current) => {
        const next = applySignalToAggregate(current, signal);
        writeStoredSimulatorAggregate(next);
        return next;
      });
      setReceipts((current) => [
        { id: `local-${current.length + 1}`, handle, mode: "browser-encrypted" },
        ...current.slice(0, 5)
      ]);
      setSignal(defaultSignal);
      setStatus("Encrypted signal added. Raw values were discarded; charts updated from aggregate counters only.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitLiveFhenixSignal() {
    setBusy(true);
    setStatus("Encrypting with CoFHE adapter and submitting a Sepolia transaction...");
    try {
      const result = await encryptAndSubmitSignal(signal);
      const handle = await encryptForDemo(signal, aggregate.encryptedSignals + 1);
      setAggregate((current) => {
        const next = applySignalToAggregate(current, signal);
        writeStoredSimulatorAggregate(next);
        return next;
      });
      setReceipts((current) => [
        { id: `live-${current.length + 1}`, handle, mode: "live-fhenix", txHash: result.txHash },
        ...current.slice(0, 5)
      ]);
      setStatus(`Live Fhenix transaction confirmed: ${result.txHash}`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function resetSnapshot() {
    commitAggregate(defaultSimulatorAggregate, "Snapshot reset to the default 30 encrypted private signals.");
    setReceipts([{ id: "snapshot-030", handle: "0x9f72...fhe030", mode: "browser-encrypted" }]);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 pb-20 pt-8 text-ink sm:px-6 lg:px-10">
      <BackgroundGlow />
      <div className="content-container relative z-10 space-y-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border-[3px] border-ink bg-white/76 p-5 shadow-brutal backdrop-blur-2xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="inline-flex rounded-full border-[3px] border-ink bg-cyanpop px-4 py-2 text-xs font-black shadow-brutalSm">
              Back to dashboard
            </Link>
            <h1 className="mt-5 text-4xl font-black leading-tight sm:text-6xl">CipherPulse Private Signal Simulator</h1>
            <p className="mt-3 max-w-3xl font-semibold leading-7 text-ink/68">
              Play with encrypted community signals and watch aggregate analytics update in real time. The simulator
              keeps raw inputs out of the analytics layer and displays only ciphertext handles plus aggregate outputs.
            </p>
          </div>
          <div className="grid gap-3">
            <button onClick={handleConnect} className="rounded-full border-[3px] border-ink bg-limepop px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
              {wallet.connected ? "Wallet connected" : "Connect wallet"}
            </button>
            <StatusPill label={runtime.liveReady ? "Live Fhenix ready" : wallet.connected ? runtime.message : "Browser encryption ready"} />
          </div>
        </header>

        <section className="safe-grid xl:grid-cols-[0.82fr_1.18fr]">
          <GlassPanel>
            <PanelTitle title="Encrypt a private signal" subtitle="Inputs are used once, converted to a ciphertext handle, then discarded from the UI state." />
            <LogicBox
              title="What happens"
              items={[
                "1. The form values are encrypted into a ciphertext handle.",
                "2. Raw values are discarded from React state after submit.",
                "3. Only aggregate counters change: sentiment, cohorts, risk, activity, and alerts.",
                "4. The shared dashboard reads the same aggregate snapshot."
              ]}
            />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="field-label">
                Cohort
                <select className="field" value={signal.cohort} onChange={(event) => setSignal({ ...signal, cohort: event.target.value as Cohort })}>
                  {cohorts.map((cohort) => (
                    <option key={cohort}>{cohort}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Governance sentiment
                <select className="field" value={signal.daoVote} onChange={(event) => setSignal({ ...signal, daoVote: event.target.value as SignalFormValues["daoVote"] })}>
                  <option value="yes">Support</option>
                  <option value="no">Against</option>
                </select>
              </label>
              <RangeField label="Activity metric" max={1200} value={signal.activityAmount} onChange={(activityAmount) => setSignal({ ...signal, activityAmount })} />
              <RangeField label="Risk score" max={100} value={signal.riskScore} onChange={(riskScore) => setSignal({ ...signal, riskScore })} />
              <RangeField label="KPI value" max={100} value={signal.kpiValue} onChange={(kpiValue) => setSignal({ ...signal, kpiValue })} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button disabled={busy} onClick={submitLocalEncryptedSignal} className="rounded-full border-[3px] border-ink bg-pinkpop px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-ink/20">
                Encrypt and update analytics
              </button>
              <button disabled={busy || !runtime.liveReady} onClick={submitLiveFhenixSignal} className="rounded-full border-[3px] border-ink bg-cyanpop px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45">
                Submit live Fhenix tx
              </button>
              <button disabled={busy} onClick={resetSnapshot} className="rounded-full border-[3px] border-ink bg-white/80 px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                Reset snapshot
              </button>
            </div>
            <div className="mt-5 rounded-3xl border-[3px] border-ink bg-limepop/26 p-4 text-sm font-black text-ink/72 shadow-brutalSm">
              {status}
            </div>
          </GlassPanel>

          <GlassPanel className="bg-cyanpop/24">
            <PanelTitle title="Live aggregate analytics" subtitle="Charts update from aggregate counters. No raw signal table is rendered." />
            <div className="mt-6 safe-grid sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Encrypted signals" value={String(aggregate.encryptedSignals)} source="Encrypted Aggregate" />
              <Metric label="Community health" value={analytics.health} source="Mixed" />
              <Metric label="Governance support" value={`${analytics.supportPct}%`} source="Encrypted Aggregate" />
              <Metric label="Risk pressure" value={analytics.riskPressure} source="Encrypted Aggregate" />
            </div>
            <div className="mt-6 safe-grid lg:grid-cols-2">
              <ChartPanel title="Governance pulse">
                <Bars labels={["Support", "Against", "Abstain"]} values={[analytics.supportPct, analytics.againstPct, analytics.abstainPct]} colors={["bg-limepop", "bg-pinkpop", "bg-cyanpop"]} mode="percent" suffix="%" />
              </ChartPanel>
              <ChartPanel title="Risk buckets">
                <Bars labels={["Low", "Medium", "High"]} values={[aggregate.risk.low, aggregate.risk.medium, aggregate.risk.high]} colors={["bg-limepop", "bg-orangepop", "bg-pinkpop"]} mode="share" />
              </ChartPanel>
              <ChartPanel title="Cohort participation">
                <Bars labels={cohorts as unknown as string[]} values={cohorts.map((cohort) => aggregate.cohorts[cohort])} colors={["bg-cyanpop", "bg-purplepop", "bg-orangepop", "bg-limepop"]} mode="share" />
              </ChartPanel>
              <ChartPanel title="Influence and activity">
                <Bars labels={["Activity", "Whale weight", "KPI alerts"]} values={[Math.min(100, Math.round(aggregate.volume / 250)), aggregate.whaleWeight, Math.min(100, aggregate.kpiAlerts * 8)]} colors={["bg-cyanpop", "bg-purplepop", "bg-pinkpop"]} mode="percent" />
              </ChartPanel>
            </div>
          </GlassPanel>
        </section>

        <section className="safe-grid xl:grid-cols-[1fr_1fr]">
          <GlassPanel>
            <PanelTitle title="Direct simulation controls" subtitle="Tune every aggregate shown in the analytics dashboard. Changes are saved locally and reflected on the main dashboard." />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <ControlField label="Encrypted signal count" value={aggregate.encryptedSignals} min={0} max={500} onChange={(encryptedSignals) => commitAggregate({ ...aggregate, encryptedSignals })} />
              <ControlField label="Active wallets" value={aggregate.activeWallets} min={0} max={100000} step={100} onChange={(activeWallets) => commitAggregate({ ...aggregate, activeWallets })} />
              <ControlField label="Transactions" value={aggregate.transactions} min={0} max={250000} step={250} onChange={(transactions) => commitAggregate({ ...aggregate, transactions })} />
              <ControlField label="Proposal count" value={aggregate.proposals} min={0} max={100} onChange={(proposals) => commitAggregate({ ...aggregate, proposals })} />
              <ControlField label="Aggregate activity volume" value={aggregate.volume} min={0} max={100000} step={250} onChange={(volume) => commitAggregate({ ...aggregate, volume })} />
              <ControlField label="Whale influence weight" value={aggregate.whaleWeight} min={0} max={100} onChange={(whaleWeight) => commitAggregate({ ...aggregate, whaleWeight })} />
              <ControlField label="Confidential KPI alerts" value={aggregate.kpiAlerts} min={0} max={100} onChange={(kpiAlerts) => commitAggregate({ ...aggregate, kpiAlerts })} />
            </div>
          </GlassPanel>

          <GlassPanel className="bg-orangepop/20">
            <PanelTitle title="Private snapshot composition" subtitle="Control the encrypted aggregate buckets directly." />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <ControlField label="Support signals" value={aggregate.sentiment.support} min={0} max={250} onChange={(support) => commitAggregate({ ...aggregate, sentiment: { ...aggregate.sentiment, support } })} />
              <ControlField label="Against signals" value={aggregate.sentiment.against} min={0} max={250} onChange={(against) => commitAggregate({ ...aggregate, sentiment: { ...aggregate.sentiment, against } })} />
              <ControlField label="Abstain signals" value={aggregate.sentiment.abstain} min={0} max={250} onChange={(abstain) => commitAggregate({ ...aggregate, sentiment: { ...aggregate.sentiment, abstain } })} />
              <ControlField label="Low risk bucket" value={aggregate.risk.low} min={0} max={250} onChange={(low) => commitAggregate({ ...aggregate, risk: { ...aggregate.risk, low } })} />
              <ControlField label="Medium risk bucket" value={aggregate.risk.medium} min={0} max={250} onChange={(medium) => commitAggregate({ ...aggregate, risk: { ...aggregate.risk, medium } })} />
              <ControlField label="High risk bucket" value={aggregate.risk.high} min={0} max={250} onChange={(high) => commitAggregate({ ...aggregate, risk: { ...aggregate.risk, high } })} />
              {cohorts.map((cohort) => (
                <ControlField
                  key={cohort}
                  label={`${cohort} encrypted signals`}
                  value={aggregate.cohorts[cohort]}
                  min={0}
                  max={250}
                  onChange={(count) => commitAggregate({ ...aggregate, cohorts: { ...aggregate.cohorts, [cohort]: count } })}
                />
              ))}
            </div>
          </GlassPanel>
        </section>

        <GlassPanel className="bg-limepop/20">
          <PanelTitle title="Expected analytics logic" subtitle="Use these rules while tuning the simulator." />
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <LogicCard title="Governance support" body="support / (support + against + abstain). Higher support improves community health." />
            <LogicCard title="Risk pressure" body="high-risk bucket share drives Low, Amber, or High risk pressure." />
            <LogicCard title="Whale influence" body="whale influence weight above 70 becomes High, 35-69 becomes Medium." />
            <LogicCard title="Main dashboard sync" body="all controls write one aggregate snapshot that the main dashboard reads instantly." />
          </div>
        </GlassPanel>

        <section className="safe-grid lg:grid-cols-[1fr_0.9fr]">
          <GlassPanel>
            <PanelTitle title="Ciphertext receipt stream" subtitle="Only handles and transaction hashes are displayed. Raw signal rows never appear." />
            <div className="mt-6 grid gap-3">
              {receipts.map((receipt) => (
                <div key={receipt.id} className="rounded-2xl border-[3px] border-ink bg-white/74 p-4 shadow-brutalSm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-black text-ink/58">{receipt.mode === "live-fhenix" ? "Live Fhenix encrypted tx" : "Browser encrypted handle"}</span>
                    <SourceBadge source={receipt.mode === "live-fhenix" ? "Live Fhenix" : "Encrypted Aggregate"} />
                  </div>
                  <div className="mt-2 break-all text-sm font-black text-ink/76">{receipt.handle}</div>
                  {receipt.txHash ? <div className="mt-2 break-all text-xs font-bold text-ink/56">tx: {receipt.txHash}</div> : null}
                </div>
              ))}
            </div>
          </GlassPanel>
          <GlassPanel className="bg-limepop/24">
            <PanelTitle title="Privacy proof" subtitle="The simulator proves the analytics layer can move without showing raw private inputs." />
            <div className="mt-6 grid gap-3">
              <Proof label="Raw signal rows rendered" value="0" />
              <Proof label="Raw risk scores displayed" value="0" />
              <Proof label="Individual votes displayed" value="0" />
              <Proof label="Ciphertext handles generated" value={String(receipts.length)} />
              <Proof label="Wallet utility" value={runtime.liveReady ? "Live Fhenix tx enabled" : wallet.connected ? "connected, adapter pending" : "connect for live tx"} />
            </div>
          </GlassPanel>
        </section>
      </div>
    </main>
  );
}

async function encryptForDemo(signal: SignalFormValues, nonce: number) {
  const payload = `${signal.cohort}|${signal.daoVote}|${signal.activityAmount}|${signal.riskScore}|${signal.kpiValue}|${nonce}|cipherpulse`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return `0x${hex.slice(0, 12)}...${hex.slice(-10)}`;
  }
  let hash = 0;
  for (let index = 0; index < payload.length; index += 1) hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
  return `0x${hash.toString(16).padStart(8, "0")}...local`;
}

function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`glass-product rounded-[2rem] border-[3px] border-ink bg-white/72 p-5 shadow-brutal backdrop-blur-2xl sm:p-6 ${className}`}>{children}</section>;
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-black">{title}</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-ink/58">{subtitle}</p>
    </div>
  );
}

function Metric({ label, value, source }: { label: string; value: string; source: SourceKind }) {
  return (
    <div className="flex min-h-40 flex-col rounded-3xl border-[3px] border-ink bg-white/76 p-4 shadow-brutalSm">
      <div className="min-h-16">
        <div className="max-w-full break-words text-sm font-black leading-5 text-ink/64">{label}</div>
        <div className="mt-3 max-w-full">
          <SourceBadge source={source} />
        </div>
      </div>
      <div className="mt-auto break-words pt-4 text-3xl font-black leading-tight">{value}</div>
    </div>
  );
}

function ControlField({
  label,
  max,
  min,
  onChange,
  step = 1,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <label className="field-label rounded-3xl border-[3px] border-ink bg-white/72 p-4 shadow-brutalSm">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="rounded-full border-2 border-ink bg-limepop px-3 py-1 text-xs font-black">{value}</span>
      </span>
      <input className="w-full accent-pinkpop" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <input className="field px-3 py-2 text-sm" type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function LogicBox({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="mt-5 rounded-3xl border-[3px] border-ink bg-cyanpop/18 p-4 shadow-brutalSm">
      <div className="text-sm font-black text-ink/58">{title}</div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item} className="rounded-2xl border-2 border-ink bg-white/74 px-3 py-2 text-xs font-black leading-5 text-ink/68">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function LogicCard({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-3xl border-[3px] border-ink bg-white/74 p-4 shadow-brutalSm">
      <div className="text-sm font-black">{title}</div>
      <p className="mt-2 text-sm font-semibold leading-6 text-ink/62">{body}</p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border-[3px] border-ink bg-white/70 p-5 shadow-brutalSm">
      <h3 className="text-lg font-black">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Bars({
  colors,
  labels,
  mode = "share",
  suffix = "",
  values
}: {
  colors: string[];
  labels: string[];
  mode?: "percent" | "share";
  suffix?: string;
  values: number[];
}) {
  const total = Math.max(values.reduce((sum, value) => sum + Math.max(0, value), 0), 1);
  return (
    <div className="grid gap-4">
      {labels.map((label, index) => (
        <div key={label}>
          <div className="flex items-center justify-between text-sm font-black text-ink/62">
            <span>{label}</span>
            <span>{values[index]}{suffix}</span>
          </div>
          <div className="mt-2 h-6 overflow-hidden rounded-full border-2 border-ink bg-white shadow-brutalSm">
            <div
              className={`h-full ${colors[index % colors.length]}`}
              style={{ width: `${barWidth(values[index], mode, total)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function barWidth(value: number, mode: "percent" | "share", total: number) {
  const raw = mode === "percent" ? value : (value / total) * 100;
  return Math.max(0, Math.min(100, raw));
}

function RangeField({ label, max, value, onChange }: { label: string; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field-label">
      <span className="flex items-center justify-between">
        {label}
        <span className="text-ink/48">{value}</span>
      </span>
      <input className="w-full accent-cyanpop" type="range" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SourceBadge({ source }: { source: SourceKind }) {
  const color = source === "Live Fhenix" ? "bg-limepop" : source === "Encrypted Aggregate" ? "bg-pinkpop" : source === "Mixed" ? "bg-orangepop" : "bg-cyanpop";
  return <span className={`inline-flex max-w-full items-center rounded-full border-2 border-ink ${color} px-2.5 py-1 text-[10px] font-black leading-tight text-ink shadow-brutalSm`}>{source}</span>;
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border-[3px] border-ink bg-white/80 px-4 py-2 text-sm font-black text-ink/72 shadow-brutalSm">
      {label}
    </span>
  );
}

function Proof({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border-[3px] border-ink bg-white/76 p-4 shadow-brutalSm">
      <div className="text-sm font-black text-ink/56">{label}</div>
      <div className="mt-1 break-words text-2xl font-black">{value}</div>
    </div>
  );
}

function BackgroundGlow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-cyanpop/30 blur-3xl" />
      <div className="absolute right-0 top-36 h-80 w-80 rounded-full bg-pinkpop/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-limepop/20 blur-3xl" />
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "shortMessage" in error) return String((error as { shortMessage?: unknown }).shortMessage);
  return String(error);
}
