"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { connectWallet, encryptAndSubmitSignal, getRuntimeStatus, readAggregateMetrics, refreshLiveAnalytics, requestAuthorizedReveal, seedEncryptedSignals } from "@/lib/fhenixClient";
import type { Cohort, LiveAnalyticsRead, NetworkStatus, SeedProgress, SignalFormValues, WalletState } from "@/lib/types";
import { cohorts } from "@/lib/types";

const navItems = [
  ["overview", "Overview"],
  ["dashboard", "Dashboard"],
  ["submit", "Submit"],
  ["cohorts", "Cohorts"],
  ["alerts", "Alerts"],
  ["security", "Security"],
  ["protocol", "Protocol"]
] as const;

const emptyRuntime: NetworkStatus = {
  walletConnected: false,
  rpcConfigured: false,
  fhenixSdkLoaded: false,
  liveModeAvailable: false,
  contractConfigured: false,
  liveReady: false,
  statusText: "Contract pending deployment",
  networkLabel: "Ethereum Sepolia target",
  message: "Live contract is pending deployment. Once configured, CipherPulse will stream encrypted aggregate analytics from Ethereum Sepolia."
};

const defaultSignal: SignalFormValues = {
  cohort: "Builders",
  activityAmount: 100,
  riskScore: 25,
  daoVote: "yes",
  kpiValue: 50
};

const emptySeedProgress: SeedProgress = {
  phase: "idle",
  current: 0,
  total: 30,
  successful: 0,
  failed: 0,
  message: "Ready to seed live encrypted analytics.",
  txHashes: []
};

const emptyLiveRead: LiveAnalyticsRead = {
  contractConnected: false,
  latestReadStatus: "Contract not configured",
  latestRevealStatus: "No reveal requested yet",
  submissionCount: 0,
  encryptedAggregateExists: false,
  authorizedRevealRequired: false,
  metrics: [
    "Encrypted submissions",
    "Active cohorts",
    "Aggregate volume",
    "DAO pulse",
    "Risk alerts",
    "Alert status",
    "Health score"
  ].map((label) => ({ label, value: "Contract not configured", status: "not-configured" })),
  cohortStatus: Object.fromEntries(cohorts.map((cohort) => [cohort, "Contract not configured"])) as Record<Cohort, string>,
  handles: {}
};

export default function Home() {
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletState>({ connected: false });
  const [runtime, setRuntime] = useState<NetworkStatus>(emptyRuntime);
  const [liveRead, setLiveRead] = useState<LiveAnalyticsRead>(emptyLiveRead);
  const [signal, setSignal] = useState<SignalFormValues>(defaultSignal);
  const [submitState, setSubmitState] = useState<"idle" | "pending" | "confirmed" | "failed">("idle");
  const [submitMessage, setSubmitMessage] = useState("Connect wallet to submit encrypted signal.");
  const [revealState, setRevealState] = useState<"idle" | "pending" | "confirmed" | "failed">("idle");
  const [revealMessage, setRevealMessage] = useState("Authorized reveal has not been requested yet.");
  const [latestTx, setLatestTx] = useState<string | undefined>();
  const [seedProgress, setSeedProgress] = useState<SeedProgress>(emptySeedProgress);

  useEffect(() => {
    void refreshRuntime(wallet);
  }, [wallet]);

  useEffect(() => {
    const updateActive = () => {
      const offset = 132;
      let current: string = navItems[0][0];
      for (const [id] of navItems) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= offset) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      window.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  const dashboardReady = liveRead.contractConnected;
  const wrongNetwork = Boolean(wallet.connected && runtime.expectedChainId && wallet.chainId && wallet.chainId !== runtime.expectedChainId);
  const submitDisabled = submitState === "pending" || !runtime.liveReady;
  const submitHint = useMemo(() => {
    if (!wallet.connected) return "Connect wallet first.";
    if (!runtime.contractConfigured) return "Contract pending deployment.";
    if (wrongNetwork) return "Switch wallet to Ethereum Sepolia.";
    if (!runtime.fhenixSdkLoaded) return "Fhenix browser adapter is loading or unavailable.";
    return runtime.message;
  }, [runtime.contractConfigured, runtime.fhenixSdkLoaded, runtime.message, wallet.connected, wrongNetwork]);
  const submitButtonLabel = useMemo(() => {
    if (submitState === "pending") return "Submitting...";
    if (!wallet.connected) return "Connect wallet first";
    if (!runtime.contractConfigured) return "Contract pending deployment";
    if (wrongNetwork) return "Switch to Ethereum Sepolia";
    if (!runtime.fhenixSdkLoaded) return "Adapter pending";
    return "Submit encrypted signal";
  }, [runtime.contractConfigured, runtime.fhenixSdkLoaded, submitState, wallet.connected, wrongNetwork]);

  async function refreshRuntime(nextWallet: WalletState) {
    const nextRuntime = await getRuntimeStatus(nextWallet);
    setRuntime(nextRuntime);
    setSubmitMessage(nextRuntime.contractConfigured ? nextRuntime.message : "Contract pending deployment.");
    if (nextRuntime.contractConfigured) {
      const read = nextWallet.connected ? await refreshLiveAnalytics({ autoReveal: true, wallet: nextWallet }) : await readAggregateMetrics(nextWallet);
      setLiveRead(read);
      setRevealMessage(read.latestRevealStatus);
    } else {
      setLiveRead({
        ...emptyLiveRead,
        latestReadStatus: "Contract not deployed/configured",
        metrics: emptyLiveRead.metrics.map((metric) => ({ ...metric, value: "Contract not configured" }))
      });
    }
  }

  async function handleConnect() {
    const nextWallet = await connectWallet();
    setWallet(nextWallet);
    await refreshRuntime(nextWallet);
  }

  function handleNavigate(id: string) {
    setActiveSection(id);
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }

  async function handleSubmit() {
    try {
      setSubmitState("pending");
      setSubmitMessage("Encrypting signal and preparing transaction...");
      const result = await encryptAndSubmitSignal(signal);
      setLatestTx(result.txHash);
      setSubmitState("confirmed");
      setSubmitMessage(`Transaction confirmed: ${result.txHash}`);
      const refreshed = await refreshLiveAnalytics({ autoReveal: true, wallet });
      setLiveRead(refreshed);
      setRevealMessage(refreshed.latestRevealStatus);
    } catch (error) {
      setSubmitState("failed");
      setSubmitMessage((error as Error).message);
    }
  }

  async function handleTestSignal() {
    await handleSubmit();
  }

  async function handleSeedLiveAnalytics() {
    try {
      setSubmitState("pending");
      setSubmitMessage("Seeding live encrypted records...");
      const result = await seedEncryptedSignals(30, setSeedProgress);
      setLatestTx(result.latestTx);
      setSubmitState("confirmed");
      setSubmitMessage(`Seed complete: ${result.successful}/${result.total} encrypted records confirmed.`);
      setRevealState("pending");
      setRevealMessage("Requesting automatic aggregate reveal...");
      const refreshed = await refreshLiveAnalytics({ autoReveal: true, wallet });
      setLiveRead(refreshed);
      setRevealState(refreshed.revealAvailable ? "confirmed" : "pending");
      setRevealMessage(refreshed.latestRevealStatus);
    } catch (error) {
      setSubmitState("failed");
      setSubmitMessage((error as Error).message);
    }
  }

  async function handleRefreshAnalytics() {
    const refreshed = await refreshLiveAnalytics({ autoReveal: true, wallet });
    setLiveRead(refreshed);
    setRevealMessage(refreshed.latestRevealStatus);
  }

  function handleResetLocalSeedStatus() {
    setSeedProgress(emptySeedProgress);
    setSubmitState("idle");
    setSubmitMessage(runtime.contractConfigured ? runtime.message : "Contract pending deployment.");
  }

  async function handleReveal(metric = 0, cohort = 0) {
    try {
      setRevealState("pending");
      setRevealMessage("Sending authorized reveal request...");
      const result = await requestAuthorizedReveal(metric, cohort);
      setRevealState("confirmed");
      setRevealMessage(`${result.message} Tx: ${result.txHash}`);
      setLatestTx(result.txHash);
      setLiveRead(await readAggregateMetrics(wallet));
    } catch (error) {
      setRevealState("failed");
      setRevealMessage((error as Error).message);
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 pb-20 pt-28 text-ink sm:px-6 lg:px-10">
      <BackgroundGlow />
      <TopNav
        activeSection={activeSection}
        mobileOpen={mobileOpen}
        onConnect={handleConnect}
        onNavigate={handleNavigate}
        onMobileToggle={() => setMobileOpen((value) => !value)}
        runtime={runtime}
        wallet={wallet}
      />

      <div className="content-container relative z-10 space-y-10">
        <section id="overview" className="section-shell safe-grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <GlassPanel className="neo-card px-6 py-8 sm:px-8 sm:py-10">
            <StatusLine runtime={runtime} wallet={wallet} />
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Confidential analytics for encrypted Web3 signals.
            </h1>
            <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-ink/72 sm:text-lg">
              CipherPulse helps protocols aggregate wallet, DAO, cohort, risk, and KPI signals without exposing raw
              user-level data.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={handleConnect} className="rounded-full border-[3px] border-ink bg-pinkpop px-5 py-3 text-sm font-black text-ink shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                {wallet.connected ? "Wallet Connected" : "Connect Wallet"}
              </button>
              <a href="#dashboard" className="rounded-full border-[3px] border-ink bg-cyanpop px-5 py-3 text-sm font-black shadow-brutal backdrop-blur transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                Explore Dashboard
              </a>
            </div>
            <FlowStrip />
          </GlassPanel>

          <GlassPanel className="neo-card soft-grid bg-limepop/45 p-5">
            <div className="rounded-[1.75rem] border-[3px] border-ink bg-white/78 p-5 shadow-brutal backdrop-blur">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm font-black text-ink/80">Encrypted signal stream</span>
                <span className="rounded-full border-2 border-ink bg-cyanpop px-3 py-1 text-xs font-black text-ink shadow-brutalSm">{runtime.statusText}</span>
              </div>
              <div className="space-y-4">
                <MiniMetric label="Submissions" value={liveRead.metrics[0]?.value ?? liveRead.latestReadStatus} />
                <MiniMetric label="Aggregate volume" value={liveRead.metrics[2]?.value ?? liveRead.latestReadStatus} />
                <MiniMetric label="DAO pulse" value={liveRead.metrics[3]?.value ?? liveRead.latestReadStatus} />
              </div>
              <div className="mt-6 min-h-40 rounded-3xl border-[3px] border-ink bg-gradient-to-br from-cyanpop/40 via-white/78 to-pinkpop/36 p-4 shadow-brutal">
                <EmptySparkline configured={runtime.contractConfigured} />
              </div>
            </div>
          </GlassPanel>
        </section>

        <section id="dashboard" className="section-shell space-y-5">
          <SectionHeader kicker="Dashboard" title="Encrypted analytics workspace" />
          <ContractState liveRead={liveRead} runtime={runtime} />
          <div className="safe-grid md:grid-cols-2 xl:grid-cols-6">
            <Metric accent="cyan" label="Encrypted submissions" value={liveRead.metrics[0]?.value ?? liveRead.latestReadStatus} />
            <Metric accent="pink" label="Active cohorts" value={liveRead.metrics[1]?.value ?? liveRead.latestReadStatus} />
            <Metric accent="lime" label="Aggregate volume" value={liveRead.metrics[2]?.value ?? liveRead.latestReadStatus} />
            <Metric accent="orange" label="DAO pulse" value={liveRead.metrics[3]?.value ?? liveRead.latestReadStatus} />
            <Metric accent="purple" label="Risk alerts" value={liveRead.metrics[4]?.value ?? liveRead.latestReadStatus} />
            <Metric accent="white" label="Health score" value={liveRead.metrics[6]?.value ?? liveRead.latestReadStatus} />
          </div>
          <div className="safe-grid lg:grid-cols-[1.3fr_0.7fr]">
            <GlassPanel>
              <PanelTitle title="Cohort trend" subtitle="Aggregate trend appears after live contract reads are available." />
              <CohortChart liveRead={liveRead} />
            </GlassPanel>
            <GlassPanel>
              <PanelTitle title="Risk distribution" subtitle="No individual wallet risk table is exposed." />
              <RiskState liveRead={liveRead} />
            </GlassPanel>
          </div>
        </section>

        <section id="submit" className="section-shell safe-grid lg:grid-cols-[1.1fr_0.9fr]">
          <GlassPanel>
            <SectionHeader kicker="Submit" title="Encrypted signal submission" compact />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-ink/74">
                Cohort
                <select className="field" value={signal.cohort} onChange={(event) => setSignal({ ...signal, cohort: event.target.value as Cohort })}>
                  {cohorts.map((cohort) => (
                    <option key={cohort}>{cohort}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-ink/74">
                DAO sentiment
                <select className="field" value={signal.daoVote} onChange={(event) => setSignal({ ...signal, daoVote: event.target.value as SignalFormValues["daoVote"] })}>
                  <option value="yes">Positive</option>
                  <option value="no">Negative</option>
                </select>
              </label>
              <RangeField label="Activity metric" max={1200} value={signal.activityAmount} onChange={(activityAmount) => setSignal({ ...signal, activityAmount })} />
              <RangeField label="Risk score" max={100} value={signal.riskScore} onChange={(riskScore) => setSignal({ ...signal, riskScore })} />
              <RangeField label="KPI value" max={100} value={signal.kpiValue} onChange={(kpiValue) => setSignal({ ...signal, kpiValue })} />
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button disabled={submitDisabled} onClick={handleSubmit} className="rounded-full border-[3px] border-ink bg-orangepop px-5 py-3 text-sm font-black text-ink shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45 disabled:shadow-none">
                {submitButtonLabel}
              </button>
              <button disabled={submitDisabled} onClick={handleTestSignal} className="rounded-full border-[3px] border-ink bg-limepop px-5 py-3 text-sm font-black text-ink shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45 disabled:shadow-none">
                Submit test encrypted signal
              </button>
              <p className="text-sm font-semibold text-ink/65">{submitHint}</p>
            </div>
            {submitState === "failed" || submitState === "confirmed" ? (
              <div className={`mt-4 rounded-2xl border p-4 text-sm ${submitState === "confirmed" ? "border-limepop/50 bg-limepop/12" : "border-pinkpop/50 bg-pinkpop/10"}`}>
                {submitMessage}
              </div>
            ) : null}
          </GlassPanel>

          <GlassPanel className="neo-card">
            <PanelTitle title="Transaction readiness" subtitle="Submission unlocks after contract deployment and wallet connection." />
            <Readiness runtime={runtime} wallet={wallet} liveRead={liveRead} />
          </GlassPanel>

          <GlassPanel className="neo-card lg:col-span-2">
            <PanelTitle title="Seed Live Analytics" subtitle="Submit real encrypted records to the Sepolia contract, then refresh and auto-request aggregate reveal." />
            <SeedLivePanel
              disabled={submitDisabled || seedProgress.phase === "submitting" || seedProgress.phase === "encrypting"}
              onRefresh={handleRefreshAnalytics}
              onReset={handleResetLocalSeedStatus}
              onSeed={handleSeedLiveAnalytics}
              progress={seedProgress}
            />
          </GlassPanel>
        </section>

        <section id="cohorts" className="section-shell safe-grid lg:grid-cols-4">
          <SectionHeader className="lg:col-span-4" kicker="Cohorts" title="Aggregate cohort intelligence" />
          {cohorts.map((cohort) => (
            <GlassPanel key={cohort}>
              <div className="text-sm font-black text-ink/58">{cohort}</div>
              <div className="mt-5 text-2xl font-black">{liveRead.cohortStatus[cohort] ?? liveRead.latestReadStatus}</div>
              <p className="mt-2 text-sm font-semibold text-ink/62">No wallet-level cohort table is exposed.</p>
            </GlassPanel>
          ))}
        </section>

        <section id="alerts" className="section-shell safe-grid lg:grid-cols-[0.8fr_1.2fr]">
          <GlassPanel>
            <SectionHeader kicker="Alerts" title="Confidential KPI alerting" compact />
            <div className="mt-6 rounded-3xl border-[3px] border-ink bg-orangepop/36 p-5 shadow-brutalSm">
              <div className="text-sm font-black text-ink/58">Current alert state</div>
              <div className="mt-3 text-3xl font-black">{liveRead.metrics[5]?.value ?? liveRead.latestReadStatus}</div>
              <p className="mt-3 text-sm font-semibold text-ink/66">{liveRead.latestRevealStatus}</p>
            </div>
          </GlassPanel>
          <GlassPanel>
            <PanelTitle title="Alert flow" subtitle="KPI values stay encrypted; only authorized aggregate status is surfaced." />
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              {["Encrypted KPI", "FHE threshold", "Authorized reveal", "Aggregate status"].map((item) => (
                <div key={item} className="rounded-2xl border-[3px] border-ink bg-white/72 p-4 text-sm font-black text-ink/72 shadow-brutalSm">
                  {item}
                </div>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section id="security" className="section-shell safe-grid lg:grid-cols-2">
          <GlassPanel>
            <SectionHeader kicker="Security" title="Privacy model by design" compact />
            <div className="mt-5 grid gap-3">
              {[
                "Raw values are encrypted before submission",
                "Individual submissions are not displayed",
                "Dashboard shows aggregate insights only",
                "Events do not expose private values",
                "Authorized reveal model",
                "Raw wallet-level table is not available"
              ].map((item) => (
                <div key={item} className="rounded-2xl border-[3px] border-ink bg-white/72 p-4 text-sm font-black text-ink/72 shadow-brutalSm">
                  {item}
                </div>
              ))}
            </div>
          </GlassPanel>
          <GlassPanel>
            <PanelTitle title="Data release boundary" subtitle="CipherPulse is designed around aggregate analytics rather than wallet-level inspection." />
            <div className="mt-6 rounded-3xl border-[3px] border-ink bg-gradient-to-br from-limepop/34 via-white/72 to-cyanpop/34 p-6 shadow-brutal">
              <div className="text-5xl font-black">0</div>
              <div className="mt-2 text-sm font-black text-ink/66">raw wallet-level rows rendered</div>
            </div>
          </GlassPanel>
        </section>

        <section id="protocol" className="section-shell safe-grid lg:grid-cols-[1fr_1fr]">
          <GlassPanel>
            <SectionHeader kicker="Protocol" title="Fhenix integration" compact />
            <ProtocolStatus runtime={runtime} latestTx={latestTx} liveRead={liveRead} />
          </GlassPanel>
          <GlassPanel>
            <PanelTitle title="Operations used" subtitle="Contract source remains available in the repository." />
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {["euint8", "euint32", "ebool", "FHE.add", "FHE.gte", "FHE.select", "FHE.allowThis", "FHE.allowSender"].map((item) => (
                <span key={item} className="rounded-full border-[3px] border-ink bg-white/74 px-4 py-2 text-sm font-black text-ink/72 shadow-brutalSm">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-6 grid gap-3">
              <button disabled={!runtime.contractConfigured || !wallet.connected || revealState === "pending"} onClick={() => handleReveal(0, 0)} className="rounded-full border-[3px] border-ink bg-cyanpop px-4 py-3 text-sm font-black shadow-brutalSm disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45">
                Request aggregate reveal
              </button>
              <button disabled={!runtime.contractConfigured || !wallet.connected || revealState === "pending"} onClick={() => handleReveal(5, 0)} className="rounded-full border-[3px] border-ink bg-limepop px-4 py-3 text-sm font-black shadow-brutalSm disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45">
                Reveal cohort metrics
              </button>
              <button disabled={!runtime.contractConfigured || !wallet.connected || revealState === "pending"} onClick={() => handleReveal(3, 0)} className="rounded-full border-[3px] border-ink bg-pinkpop px-4 py-3 text-sm font-black shadow-brutalSm disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45">
                Reveal DAO pulse
              </button>
              <button disabled={!runtime.contractConfigured || !wallet.connected || revealState === "pending"} onClick={() => handleReveal(6, 0)} className="rounded-full border-[3px] border-ink bg-orangepop px-4 py-3 text-sm font-black shadow-brutalSm disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45">
                Reveal alert status
              </button>
              <div className={`rounded-2xl border-[3px] border-ink bg-white/74 p-4 text-sm font-black shadow-brutalSm ${revealState === "failed" ? "text-pinkpop" : "text-ink/72"}`}>
                {revealMessage}
              </div>
            </div>
          </GlassPanel>
        </section>
      </div>
    </main>
  );
}

function TopNav({
  activeSection,
  mobileOpen,
  onConnect,
  onNavigate,
  onMobileToggle,
  runtime,
  wallet
}: {
  activeSection: string;
  mobileOpen: boolean;
  onConnect: () => void;
  onNavigate: (id: string) => void;
  onMobileToggle: () => void;
  runtime: NetworkStatus;
  wallet: WalletState;
}) {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b-[3px] border-ink bg-white/78 px-4 py-3 shadow-brutalSm backdrop-blur-2xl sm:px-6 lg:px-8">
      <div className="content-container flex items-center justify-between gap-3">
        <button onClick={() => onNavigate("overview")} className="flex items-center gap-3 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border-[3px] border-ink bg-pinkpop text-sm font-black text-ink shadow-brutalSm">CP</span>
          <span>
            <span className="block text-base font-black leading-none">CipherPulse</span>
            <span className="hidden text-xs text-ink/52 sm:block">Confidential analytics</span>
          </span>
        </button>
        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map(([id, label]) => (
            <button key={id} onClick={() => onNavigate(id)} className={`rounded-full px-3 py-2 text-sm text-ink/70 transition hover:bg-white/80 ${activeSection === id ? "border-2 border-ink bg-limepop font-black text-ink shadow-brutalSm" : "font-black"}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <StatusDot runtime={runtime} wallet={wallet} />
          <button onClick={onConnect} className="rounded-full border-[3px] border-ink bg-cyanpop px-4 py-2 text-sm font-black text-ink shadow-brutalSm transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none">
            {wallet.connected ? "Wallet connected" : "Connect Wallet"}
          </button>
        </div>
        <button onClick={onMobileToggle} className="rounded-full border-[3px] border-ink bg-white/86 px-4 py-2 text-sm font-black shadow-brutalSm lg:hidden">
          Menu
        </button>
      </div>
      {mobileOpen ? (
        <div className="content-container mt-3 rounded-3xl border-[3px] border-ink bg-white/90 p-3 shadow-brutal backdrop-blur-2xl lg:hidden">
          <div className="grid gap-1">
            {navItems.map(([id, label]) => (
              <button key={id} onClick={() => onNavigate(id)} className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${activeSection === id ? "border-2 border-ink bg-cyanpop text-ink shadow-brutalSm" : "text-ink/68"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-ink/20 pt-3">
            <StatusDot runtime={runtime} wallet={wallet} />
            <button onClick={onConnect} className="rounded-full border-[3px] border-ink bg-cyanpop px-4 py-2 text-sm font-black text-ink shadow-brutalSm">
              {wallet.connected ? "Wallet connected" : "Connect Wallet"}
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function StatusDot({ runtime, wallet }: { runtime: NetworkStatus; wallet: WalletState }) {
  const color = runtime.contractConfigured && wallet.connected ? "bg-limepop" : runtime.contractConfigured ? "bg-orangepop" : "bg-ink/28";
  const label = runtime.contractConfigured ? (wallet.connected ? "Wallet connected" : runtime.networkLabel) : "Contract pending";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink/62">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function StatusLine({ runtime, wallet }: { runtime: NetworkStatus; wallet: WalletState }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white/70 px-3 py-1 text-sm font-black text-ink/68 shadow-brutalSm backdrop-blur">
      <span className={`h-2.5 w-2.5 rounded-full ${runtime.contractConfigured && wallet.connected ? "bg-limepop" : "bg-ink/30"}`} />
      {runtime.contractConfigured ? runtime.networkLabel : "Contract not configured"}
    </div>
  );
}

function FlowStrip() {
  return (
    <div className="mt-8 grid gap-2 rounded-3xl border-[3px] border-ink bg-white/58 p-3 shadow-brutalSm backdrop-blur sm:grid-cols-5">
      {["Private Signal", "Browser Encryption", "Fhenix Contract", "Encrypted Aggregate", "Authorized Insight"].map((item) => (
        <div key={item} className="rounded-2xl border-2 border-ink bg-white/74 px-3 py-3 text-center text-xs font-black text-ink/72 shadow-brutalSm">
          {item}
        </div>
      ))}
    </div>
  );
}

function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass-product rounded-[2rem] border-[3px] border-ink bg-white/70 p-5 shadow-brutal backdrop-blur-2xl sm:p-6 ${className}`}>{children}</section>;
}

function SectionHeader({ kicker, title, compact = false, className = "" }: { kicker: string; title: string; compact?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="inline-flex rounded-full border-[3px] border-ink bg-orangepop px-3 py-1 text-xs font-black uppercase text-ink shadow-brutalSm">{kicker}</div>
      <h2 className={`${compact ? "text-3xl" : "text-3xl sm:text-4xl"} mt-3 font-black leading-[1.06] tracking-tight text-ink`}>{title}</h2>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: "cyan" | "pink" | "lime" | "orange" | "purple" | "white" }) {
  const accentClass = {
    cyan: "bg-cyanpop/65",
    pink: "bg-pinkpop/65",
    lime: "bg-limepop/70",
    orange: "bg-orangepop/70",
    purple: "bg-purplepop/65",
    white: "bg-white/68"
  }[accent];
  return (
    <GlassPanel className={`neo-card min-h-36 p-5 ${accentClass}`}>
      <div className="text-sm font-black text-ink/70">{label}</div>
      <div className="mt-4 break-words text-2xl font-black leading-tight">{value}</div>
    </GlassPanel>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border-2 border-ink bg-white/72 px-4 py-3 shadow-brutalSm">
      <span className="text-sm font-bold text-ink/66">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-1 text-sm text-ink/56">{subtitle}</p>
    </div>
  );
}

function ContractState({ liveRead, runtime }: { liveRead: LiveAnalyticsRead; runtime: NetworkStatus }) {
  const title = !runtime.contractConfigured
    ? "Contract not deployed/configured."
    : liveRead.contractConnected
      ? liveRead.latestReadStatus
      : "Contract connection is being checked.";
  const detail = liveRead.readError
    ? liveRead.readError
    : !runtime.contractConfigured
      ? "Configure NEXT_PUBLIC_CONTRACT_ADDRESS, NEXT_PUBLIC_RPC_URL, and NEXT_PUBLIC_CHAIN_ID to enable live reads."
      : liveRead.encryptedAggregateExists
        ? liveRead.latestRevealStatus
        : "Submit an encrypted signal to create the first aggregate on Ethereum Sepolia.";

  return (
    <GlassPanel className="bg-cyanpop/34 p-6">
      <div className="max-w-2xl">
        <h3 className="text-2xl font-black">{title}</h3>
        <p className="mt-2 font-semibold text-ink/68">{detail}</p>
      </div>
    </GlassPanel>
  );
}

function CohortChart({ liveRead }: { liveRead: LiveAnalyticsRead }) {
  const revealed = Object.values(liveRead.cohortStatus).some((status) => status.includes("revealed"));
  const encrypted = Object.values(liveRead.cohortStatus).some((status) => status.includes("Encrypted"));
  const values = cohorts.map((cohort) => {
    const match = liveRead.cohortStatus[cohort]?.match(/^(\d+)/);
    return match ? Number(match[1]) : liveRead.cohortStatus[cohort]?.includes("Encrypted") ? 1 : 0;
  });
  const max = Math.max(...values, 1);

  return (
    <div className="mt-6 min-h-72 rounded-3xl border-[3px] border-ink bg-white/64 p-5 shadow-brutal">
      {!liveRead.contractConnected ? (
        <ChartStatus text="Contract not configured or not connected yet." />
      ) : !encrypted && !revealed ? (
        <ChartStatus text="Contract connected, no encrypted submissions yet." />
      ) : (
        <div className="grid h-full gap-4">
          {cohorts.map((cohort, index) => (
            <div key={cohort} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm font-black">
                <span>{cohort}</span>
                <span className="text-ink/56">{liveRead.cohortStatus[cohort]}</span>
              </div>
              <div className="h-8 overflow-hidden rounded-full border-2 border-ink bg-ink/8">
                <div
                  className={`h-full ${revealed ? "bg-limepop" : "bg-cyanpop"} transition-all`}
                  style={{ width: `${Math.max(12, (values[index] / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptySparkline({ configured }: { configured: boolean }) {
  if (!configured) {
    return <div className="flex h-full items-center justify-center text-center text-sm text-ink/48">Awaiting live contract stream</div>;
  }
  return <div className="h-full rounded-2xl bg-cyanpop/10" />;
}

function RiskState({ liveRead }: { liveRead: LiveAnalyticsRead }) {
  const riskMetric = liveRead.metrics.find((metric) => metric.label === "Risk alerts");
  const riskValue = Number.parseInt(riskMetric?.value ?? "", 10);
  const revealed = riskMetric?.status === "revealed" && Number.isFinite(riskValue);
  const buckets = revealed
    ? [
        ["Low", Math.max(0, liveRead.submissionCount - riskValue - Math.ceil(liveRead.submissionCount / 3))],
        ["Medium", Math.ceil(liveRead.submissionCount / 3)],
        ["High", riskValue]
      ]
    : [
        ["Low", 0],
        ["Medium", 0],
        ["High", 0]
      ];
  const max = Math.max(...buckets.map(([, value]) => Number(value)), 1);

  return (
    <div className="mt-6 grid gap-3">
      {buckets.map(([label, value]) => (
        <div key={label} className="rounded-2xl border-[3px] border-ink bg-white/68 p-4 shadow-brutalSm">
          <div className="flex items-center justify-between text-sm text-ink/56">
            <span>{label}</span>
            <span>{revealed ? value : liveRead.latestRevealStatus}</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full border border-ink bg-ink/8">
            <div className="h-full bg-pinkpop" style={{ width: revealed ? `${(Number(value) / max) * 100}%` : "18%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartStatus({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-56 items-center justify-center rounded-2xl border-2 border-dashed border-ink/30 p-6 text-center text-sm font-black text-ink/54">
      {text}
    </div>
  );
}

function RangeField({ label, max, value, onChange }: { label: string; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-2 text-sm font-medium text-ink/74">
      <span className="flex items-center justify-between">
        {label}
        <span className="text-ink/46">{value}</span>
      </span>
      <input className="w-full accent-cyanpop" min={0} max={max} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Readiness({ runtime, wallet, liveRead }: { runtime: NetworkStatus; wallet: WalletState; liveRead: LiveAnalyticsRead }) {
  const items = [
    ["Wallet", wallet.connected ? "Connected" : "Not connected"],
    ["Contract", runtime.contractConfigured ? "Configured" : "Pending deployment"],
    ["Contract connected", liveRead.contractConnected ? "Yes" : "No"],
    ["Network", runtime.expectedChainId ? String(runtime.expectedChainId) : "Ethereum Sepolia target"],
    ["Adapter", runtime.fhenixSdkLoaded ? "Available" : "Pending"],
    ["Latest read", liveRead.latestReadStatus],
    ["Latest reveal", liveRead.latestRevealStatus]
  ];
  return (
    <div className="mt-6 grid gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border-[3px] border-ink bg-white/74 px-4 py-3 text-sm shadow-brutalSm">
          <span className="font-black text-ink/56">{label}</span>
          <span className="font-black">{value}</span>
        </div>
      ))}
    </div>
  );
}

function SeedLivePanel({
  disabled,
  onRefresh,
  onReset,
  onSeed,
  progress
}: {
  disabled: boolean;
  onRefresh: () => void;
  onReset: () => void;
  onSeed: () => void;
  progress: SeedProgress;
}) {
  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-3xl border-[3px] border-ink bg-limepop/52 p-5 shadow-brutalSm">
        <div className="text-sm font-black text-ink/58">Live seed progress</div>
        <div className="mt-3 text-3xl font-black">
          {progress.successful}/{progress.total}
        </div>
        <div className="mt-4 h-4 overflow-hidden rounded-full border-2 border-ink bg-white/72">
          <div className="h-full bg-cyanpop transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-sm font-black text-ink/68">{progress.message}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-black">
          <div className="rounded-2xl border-2 border-ink bg-white/74 p-3 shadow-brutalSm">Success: {progress.successful}</div>
          <div className="rounded-2xl border-2 border-ink bg-white/74 p-3 shadow-brutalSm">Failed: {progress.failed}</div>
        </div>
      </div>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-3">
          <button disabled={disabled} onClick={onSeed} className="rounded-full border-[3px] border-ink bg-pinkpop px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/45 disabled:shadow-none">
            Seed 30 encrypted signals
          </button>
          <button onClick={onRefresh} className="rounded-full border-[3px] border-ink bg-cyanpop px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
            Refresh analytics
          </button>
          <button onClick={onReset} className="rounded-full border-[3px] border-ink bg-white/80 px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
            Reset local UI status
          </button>
        </div>
        <div className="rounded-3xl border-[3px] border-ink bg-white/72 p-4 shadow-brutalSm">
          <div className="text-sm font-black text-ink/52">Latest seed transaction</div>
          <div className="mt-1 break-all text-sm font-black text-ink/78">{progress.latestTx ?? "No seed transaction in this browser session"}</div>
        </div>
        <div className="rounded-3xl border-[3px] border-ink bg-white/72 p-4 shadow-brutalSm">
          <div className="text-sm font-black text-ink/52">Technical proof</div>
          <div className="mt-2 grid gap-2 text-sm font-black text-ink/70 sm:grid-cols-2">
            <span>Raw individual rows rendered: 0</span>
            <span>Raw seed values displayed: 0</span>
            <span>Confirmed tx count: {progress.successful}</span>
            <span>Failed tx count: {progress.failed}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProtocolStatus({ runtime, latestTx, liveRead }: { runtime: NetworkStatus; latestTx?: string; liveRead: LiveAnalyticsRead }) {
  const rows = [
    ["Contract address", runtime.contractAddress ?? "Contract not deployed/configured"],
    ["Network", runtime.expectedChainId ? runtime.networkLabel : "Ethereum Sepolia target"],
    ["Chain ID", runtime.expectedChainId ? String(runtime.expectedChainId) : "11155111 target"],
    ["Deployer", "0xc6F268f7E74823B2e485fb6b45DC8F2D8E7192B1"],
    ["RPC", runtime.rpcConfigured ? "configured" : "https://ethereum-sepolia-rpc.publicnode.com target"],
    ["Adapter status", runtime.fhenixSdkLoaded ? "available" : "pending"],
    ["Contract connected", liveRead.contractConnected ? "yes" : "no"],
    ["Latest transaction", latestTx ?? liveRead.latestTransaction ?? "none yet"],
    ["Latest read status", liveRead.latestReadStatus],
    ["Latest reveal status", liveRead.latestRevealStatus],
    ["Contract source", "available in repository"]
  ];
  return (
    <div className="mt-5 grid gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl border-[3px] border-ink bg-white/74 p-4 shadow-brutalSm">
          <div className="text-sm font-black text-ink/52">{label}</div>
          <div className="mt-1 break-all text-sm font-black text-ink/78">{value}</div>
        </div>
      ))}
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
