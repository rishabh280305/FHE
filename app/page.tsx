"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  connectWallet,
  getRuntimeStatus,
  readAggregateMetrics,
  refreshLiveAnalytics
} from "@/lib/fhenixClient";
import { defaultSimulatorAggregate, readStoredSimulatorAggregate, SIMULATOR_STORAGE_KEY, toDashboardSeed } from "@/lib/simulatorState";
import type { SimulatorAggregate } from "@/lib/simulatorState";
import type { Cohort, LiveAnalyticsRead, NetworkStatus, WalletState } from "@/lib/types";
import { cohorts } from "@/lib/types";

const navItems = [
  ["overview", "Overview"],
  ["community-health", "Community Health"],
  ["governance-pulse", "Governance Pulse"],
  ["activity-cohorts", "Activity & Cohorts"],
  ["risk-influence", "Risk & Influence"]
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
  message: "Live contract is pending deployment. Private snapshots will read from Ethereum Sepolia after configuration."
};

const emptyLiveRead: LiveAnalyticsRead = {
  contractConnected: false,
  latestReadStatus: "Contract not configured",
  latestRevealStatus: "No private snapshot requested yet",
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
  ].map((label) => ({ label, value: "Private snapshot pending", status: "not-configured" })),
  cohortStatus: Object.fromEntries(cohorts.map((cohort) => [cohort, "Private snapshot pending"])) as Record<Cohort, string>,
  handles: {}
};

type SourceKind = "Public" | "Private FHE Snapshot" | "Mixed";

export default function Home() {
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletState>({ connected: false });
  const [runtime, setRuntime] = useState<NetworkStatus>(emptyRuntime);
  const [liveRead, setLiveRead] = useState<LiveAnalyticsRead>(emptyLiveRead);
  const [simAggregate, setSimAggregate] = useState<SimulatorAggregate>(defaultSimulatorAggregate);

  useEffect(() => {
    void refreshRuntime(wallet);
  }, [wallet]);

  useEffect(() => {
    const updateActive = () => {
      const offset = 132;
      let current: string = navItems[0][0];
      for (const [id] of navItems) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= offset) current = id;
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

  useEffect(() => {
    const syncSimulator = () => setSimAggregate(readStoredSimulatorAggregate());
    syncSimulator();
    const onStorage = (event: StorageEvent) => {
      if (event.key === SIMULATOR_STORAGE_KEY) syncSimulator();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncSimulator);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", syncSimulator);
    };
  }, []);

  const dashboardSeed = useMemo(() => toDashboardSeed(simAggregate), [simAggregate]);
  const snapshot = useMemo(() => buildSnapshot(liveRead, dashboardSeed), [liveRead, dashboardSeed]);

  async function refreshRuntime(nextWallet: WalletState) {
    const nextRuntime = await getRuntimeStatus(nextWallet);
    setRuntime(nextRuntime);
    if (nextRuntime.contractConfigured) {
      const read = nextWallet.connected ? await refreshLiveAnalytics({ autoReveal: true, wallet: nextWallet }) : await readAggregateMetrics(nextWallet);
      setLiveRead(read);
    } else {
      setLiveRead(emptyLiveRead);
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

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 pb-20 pt-28 text-ink sm:px-6 lg:px-10">
      <BackgroundGlow />
      <TopNav
        activeSection={activeSection}
        mobileOpen={mobileOpen}
        onConnect={handleConnect}
        onMobileToggle={() => setMobileOpen((value) => !value)}
        onNavigate={handleNavigate}
        runtime={runtime}
        wallet={wallet}
      />

      <div className="content-container relative z-10 space-y-10">
        <section id="overview" className="section-shell safe-grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <GlassPanel className="neo-card px-6 py-8 sm:px-8 sm:py-10">
            <div className="inline-flex rounded-full border-[3px] border-ink bg-limepop px-4 py-2 text-xs font-black shadow-brutalSm">
              Same dashboard for every protocol user
            </div>
            <h1 className="mt-6 max-w-5xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Transparent protocol analytics without exposing private signals.
            </h1>
            <p className="mt-5 max-w-3xl text-base font-semibold leading-7 text-ink/72 sm:text-lg">
              CipherPulse gives every protocol user a shared view of community health, governance sentiment, activity,
              risk pressure, and whale influence. Public metrics stay cheap. Sensitive signals are aggregated privately
              with Fhenix and released as daily or weekly snapshots.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={() => handleNavigate("community-health")} className="rounded-full border-[3px] border-ink bg-pinkpop px-5 py-3 text-sm font-black text-ink shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                View community health
              </button>
              <button onClick={() => handleNavigate("governance-pulse")} className="rounded-full border-[3px] border-ink bg-cyanpop px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                Explore governance pulse
              </button>
              <Link href="/simulator" className="rounded-full border-[3px] border-ink bg-limepop px-5 py-3 text-sm font-black shadow-brutal transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                Open live simulator
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Public metrics + private aggregate snapshots", "No wallet-level tables", "FHE only where privacy matters", "Daily/weekly private updates"].map((item) => (
                <span key={item} className="rounded-full border-2 border-ink bg-white/72 px-3 py-2 text-xs font-black text-ink/70 shadow-brutalSm">
                  {item}
                </span>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="neo-card bg-cyanpop/35">
            <PanelTitle title="Snapshot model" subtitle="Private metrics update as daily or weekly encrypted snapshots. Public metrics can update continuously." />
            <FlowStrip />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <MiniProof label="Public analytics" value="Frequent reads" />
              <MiniProof label="Private FHE snapshot" value={snapshot.snapshotState} />
              <MiniProof label="Last snapshot" value={snapshot.lastSnapshot} />
              <MiniProof label="Next snapshot" value={snapshot.nextSnapshot} />
            </div>
          </GlassPanel>
        </section>

        <section className="section-shell safe-grid md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard label="Community Health" value={snapshot.health} source="Mixed" detail={snapshot.healthDetail} />
          <SummaryCard label="Governance Sentiment" value={snapshot.daoPulse} source="Private FHE Snapshot" detail="Released only as an aggregate snapshot." />
          <SummaryCard label="Activity Trend" value={snapshot.activityTrend} source="Public" detail={`${snapshot.activeWallets} active wallets across ${snapshot.transactionCount} public interactions.`} />
          <SummaryCard label="Whale Influence" value={snapshot.whaleInfluence} source="Private FHE Snapshot" detail="No wallet list is exposed." />
          <SummaryCard label="Risk Pressure" value={snapshot.riskPressure} source="Private FHE Snapshot" detail="Risk buckets are aggregate-only." />
          <SummaryCard label="Last Private Snapshot" value={snapshot.lastSnapshot} source="Private FHE Snapshot" detail={`${snapshot.privateSignals} encrypted signals in the latest aggregate snapshot.`} />
        </section>

        <section id="community-health" className="section-shell space-y-5">
          <SectionHeader kicker="Community Health" title="A shared health view for the whole protocol" />
          <GlassPanel className="bg-limepop/36">
            <p className="max-w-4xl text-lg font-bold leading-8 text-ink/72">
              This is not a private admin report. CipherPulse is a shared aggregate transparency layer for protocol
              teams, DAO members, token holders, contributors, users, and partners.
            </p>
          </GlassPanel>
          <div className="safe-grid md:grid-cols-2 xl:grid-cols-3">
            <InsightCard title="Overall health" value={snapshot.health} source="Mixed" detail={snapshot.healthDetail} accent="lime" />
            <InsightCard title="Participation quality" value={snapshot.participationQuality} source="Mixed" detail="Combines public participation and private sentiment pressure." accent="cyan" />
            <InsightCard title="Contributor activity" value={snapshot.contributorActivity} source="Public" detail={`${snapshot.activityTrend} change from the previous community window.`} accent="white" />
            <InsightCard title="Governance confidence" value={snapshot.daoPulse} source="Private FHE Snapshot" detail="Private survey or pulse signals reveal only aggregate confidence." accent="pink" />
            <InsightCard title="Risk pressure" value={snapshot.riskPressure} source="Private FHE Snapshot" detail="No raw risk scores are shown." accent="orange" />
            <InsightCard title="Whale concentration" value={snapshot.whaleInfluence} source="Private FHE Snapshot" detail="Concentration is summarized without wallet-level exposure." accent="purple" />
          </div>
          <GlassPanel>
            <PanelTitle title="Health composition" subtitle="A single shared protocol view composed from public activity and private aggregate snapshots." />
            <HealthComposition snapshot={snapshot} />
          </GlassPanel>
        </section>

        <section id="governance-pulse" className="section-shell safe-grid lg:grid-cols-[0.9fr_1.1fr]">
          <GlassPanel>
            <SectionHeader kicker="Governance Pulse" title="Proposal sentiment without vote leakage" compact />
            <p className="mt-4 font-semibold leading-7 text-ink/68">
              CipherPulse does not reveal how any wallet voted. It only shows aggregate proposal sentiment. Public votes
              can remain public metrics; private pulse surveys become FHE snapshots.
            </p>
            <div className="mt-6 grid gap-3">
              <MetricRow label="Support" value={snapshot.daoPulse} source="Private FHE Snapshot" />
              <MetricRow label="Against" value={snapshot.againstPulse} source="Private FHE Snapshot" />
              <MetricRow label="Abstain" value={`${snapshot.abstainPct}% abstain`} source="Private FHE Snapshot" />
              <MetricRow label="Proposal readiness" value="Ready with watchlist" source="Mixed" />
              <MetricRow label="Participation diversity" value={snapshot.participationQuality} source="Mixed" />
            </div>
          </GlassPanel>
          <GlassPanel className="bg-pinkpop/28">
            <PanelTitle title="Sentiment trend" subtitle="A daily/weekly private pulse can be cached for every community member." />
            <SimpleBars
              labels={["Support", "Against", "Abstain"]}
              values={[snapshot.daoPct, snapshot.againstPct, snapshot.abstainPct]}
              pending={false}
            />
          </GlassPanel>
        </section>

        <section id="activity-cohorts" className="section-shell space-y-5">
          <SectionHeader kicker="Activity & Cohorts" title="Public activity plus private cohort pulse" />
          <div className="safe-grid lg:grid-cols-[0.8fr_1.2fr]">
            <GlassPanel>
              <PanelTitle title="Public analytics path" subtitle="Cheap public metrics stay outside FHE and can update more often." />
              <div className="mt-6 grid gap-3">
                <MetricRow label="Active wallets" value={snapshot.activeWallets} source="Public" />
                <MetricRow label="Transaction count" value={snapshot.transactionCount} source="Public" />
                <MetricRow label="Proposal count" value={snapshot.proposalCount} source="Public" />
                <MetricRow label="Public participation" value={snapshot.publicParticipation} source="Public" />
              </div>
            </GlassPanel>
            <GlassPanel>
              <PanelTitle title="Private cohort pulse" subtitle="Cohorts are aggregate transparency signals, not admin segmentation." />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {snapshot.cohorts.map((cohort) => (
                  <CohortTile key={cohort.cohort} cohort={cohort.cohort} count={cohort.count} pulse={cohort.pulse} volume={cohort.volume} />
                ))}
              </div>
            </GlassPanel>
          </div>
        </section>

        <section id="risk-influence" className="section-shell safe-grid lg:grid-cols-[1.1fr_0.9fr]">
          <GlassPanel>
            <SectionHeader kicker="Risk & Influence" title="Is the community being pressured or dominated?" compact />
            <p className="mt-4 font-semibold leading-7 text-ink/68">
              CipherPulse shows whether risk pressure exists. It does not expose which wallet caused it.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <InsightCard title="Whale influence" value={snapshot.whaleInfluence} source="Private FHE Snapshot" detail="Private concentration thresholds reveal only a level." accent="purple" />
              <InsightCard title="Sybil / risk pressure" value={snapshot.riskPressure} source="Private FHE Snapshot" detail="Sensitive risk buckets stay encrypted until aggregate reveal." accent="orange" />
              <InsightCard title="Participation concentration" value={snapshot.participationQuality} source="Mixed" detail="Public distribution can be combined with private pressure signals." accent="cyan" />
              <InsightCard title="Alert status" value={snapshot.alertStatus} source="Private FHE Snapshot" detail="Confidential KPI threshold emits only aggregate status." accent="pink" />
            </div>
          </GlassPanel>
          <GlassPanel className="bg-orangepop/26">
            <PanelTitle title="Risk distribution" subtitle="Private risk scores are shown only as aggregate buckets." />
            <RiskDistribution snapshot={snapshot} />
          </GlassPanel>
        </section>
      </div>
    </main>
  );
}

function buildSnapshot(liveRead: LiveAnalyticsRead, dashboardSeed: ReturnType<typeof toDashboardSeed>) {
  const healthMetric = metric(liveRead, "Health score");
  const daoMetric = metric(liveRead, "DAO pulse");
  const riskMetric = metric(liveRead, "Risk alerts");
  const alertMetric = metric(liveRead, "Alert status");
  const parsedDaoPct = parseFirstNumber(daoMetric?.value);
  const daoPct = daoMetric?.status === "revealed" && parsedDaoPct !== undefined && parsedDaoPct > 0 ? parsedDaoPct : undefined;
  const riskCount = parseFirstNumber(riskMetric?.value);
  const revealed = liveRead.revealAvailable || liveRead.metrics.some((item) => item.status === "revealed");
  const riskHigh = riskCount ?? dashboardSeed.riskBuckets.high;
  const snapshotState = revealed ? "Live FHE snapshot visible" : "Seeded community snapshot";
  const riskPressure = riskHigh >= 8 ? "High" : riskHigh >= 3 ? "Amber" : "Low";
  const health = healthMetric?.status === "revealed" ? healthMetric.value : dashboardSeed.health;
  const whaleInfluence = riskHigh >= 8 ? "High" : dashboardSeed.whaleInfluence;
  const resolvedDaoPct = daoPct ?? dashboardSeed.governancePositive;

  return {
    snapshotState,
    health,
    healthDetail:
      health === "Green"
        ? "Support is strong and risk pressure is low."
        : health === "Amber"
          ? "Support is positive, but influence or risk pressure needs watching."
          : health === "Red"
            ? "Private risk pressure is elevated."
            : dashboardSeed.healthDetail,
    daoPulse: daoMetric?.status === "revealed" ? daoMetric.value : `${resolvedDaoPct}% positive`,
    againstPulse: `${daoPct === undefined ? dashboardSeed.governanceAgainst : Math.max(0, 90 - daoPct)}% against`,
    daoPct: resolvedDaoPct,
    againstPct: daoPct === undefined ? dashboardSeed.governanceAgainst : Math.max(0, 90 - daoPct),
    abstainPct: dashboardSeed.governanceAbstain,
    riskPressure,
    whaleInfluence,
    alertStatus: alertMetric?.status === "revealed" ? alertMetric.value : dashboardSeed.alertStatus,
    participationQuality: dashboardSeed.participationQuality,
    lastSnapshot: revealed ? "Live reveal available" : dashboardSeed.lastSnapshot,
    nextSnapshot: dashboardSeed.nextSnapshot,
    activityTrend: dashboardSeed.activityTrend,
    activeWallets: dashboardSeed.activeWallets,
    transactionCount: dashboardSeed.transactionCount,
    proposalCount: dashboardSeed.proposalCount,
    publicParticipation: dashboardSeed.publicParticipation,
    contributorActivity: dashboardSeed.contributorActivity,
    privateSignals: liveRead.submissionCount > 1 ? liveRead.submissionCount : 30,
    healthScore: dashboardSeed.healthScore,
    riskBuckets: dashboardSeed.riskBuckets,
    cohorts: dashboardSeed.cohorts
  };
}

function metric(liveRead: LiveAnalyticsRead, label: string) {
  return liveRead.metrics.find((item) => item.label === label);
}

function parseFirstNumber(value?: string) {
  if (!value) return undefined;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function TopNav({
  activeSection,
  mobileOpen,
  onConnect,
  onMobileToggle,
  onNavigate,
  runtime,
  wallet
}: {
  activeSection: string;
  mobileOpen: boolean;
  onConnect: () => void;
  onMobileToggle: () => void;
  onNavigate: (id: string) => void;
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
            <span className="hidden text-xs text-ink/52 sm:block">Shared protocol analytics</span>
          </span>
        </button>
        <nav className="hidden items-center gap-1 xl:flex">
          {navItems.map(([id, label]) => (
            <button key={id} onClick={() => onNavigate(id)} className={`rounded-full px-3 py-2 text-xs text-ink/70 transition hover:bg-white/80 ${activeSection === id ? "border-2 border-ink bg-limepop font-black text-ink shadow-brutalSm" : "font-black"}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <StatusDot runtime={runtime} wallet={wallet} />
          <button onClick={onConnect} className="rounded-full border-[3px] border-ink bg-cyanpop px-4 py-2 text-sm font-black text-ink shadow-brutalSm transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none">
            {wallet.connected ? "Wallet connected" : "Connect wallet"}
          </button>
        </div>
        <button onClick={onMobileToggle} className="rounded-full border-[3px] border-ink bg-white/86 px-4 py-2 text-sm font-black shadow-brutalSm xl:hidden">
          Menu
        </button>
      </div>
      {mobileOpen ? (
        <div className="content-container mt-3 rounded-3xl border-[3px] border-ink bg-white/92 p-3 shadow-brutal backdrop-blur-2xl xl:hidden">
          <div className="grid gap-1">
            {navItems.map(([id, label]) => (
              <button key={id} onClick={() => onNavigate(id)} className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${activeSection === id ? "border-2 border-ink bg-cyanpop text-ink shadow-brutalSm" : "text-ink/68"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink/20 pt-3">
            <StatusDot runtime={runtime} wallet={wallet} />
            <button onClick={onConnect} className="rounded-full border-[3px] border-ink bg-cyanpop px-4 py-2 text-sm font-black text-ink shadow-brutalSm">
              {wallet.connected ? "Wallet connected" : "Connect wallet"}
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function StatusDot({ runtime, wallet }: { runtime: NetworkStatus; wallet: WalletState }) {
  const color = runtime.contractConfigured && wallet.connected ? "bg-limepop" : runtime.contractConfigured ? "bg-orangepop" : "bg-ink/28";
  const label = runtime.contractConfigured ? (wallet.connected ? "Wallet connected" : "Live Sepolia contract") : "Snapshot contract pending";
  return (
    <span className="inline-flex items-center gap-2 text-sm font-bold text-ink/62">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
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

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-1 text-sm font-semibold leading-6 text-ink/58">{subtitle}</p>
    </div>
  );
}

function SourceBadge({ source }: { source: SourceKind }) {
  const color = source === "Public" ? "bg-cyanpop" : source === "Mixed" ? "bg-limepop" : "bg-pinkpop";
  return <span className={`rounded-full border-2 border-ink ${color} px-2.5 py-1 text-[11px] font-black text-ink shadow-brutalSm`}>{source}</span>;
}

function SummaryCard({ label, value, source, detail }: { label: string; value: string; source: SourceKind; detail: string }) {
  return (
    <GlassPanel className="min-h-44">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-black text-ink/58">{label}</div>
        <SourceBadge source={source} />
      </div>
      <div className="mt-5 break-words text-3xl font-black leading-tight">{value}</div>
      <p className="mt-3 text-sm font-semibold leading-6 text-ink/62">{detail}</p>
    </GlassPanel>
  );
}

function InsightCard({ title, value, source, detail, accent }: { title: string; value: string; source: SourceKind; detail: string; accent: "lime" | "cyan" | "pink" | "orange" | "purple" | "white" }) {
  const accentClass = {
    lime: "bg-limepop/45",
    cyan: "bg-cyanpop/38",
    pink: "bg-pinkpop/32",
    orange: "bg-orangepop/36",
    purple: "bg-purplepop/28",
    white: "bg-white/70"
  }[accent];
  return (
    <div className={`rounded-3xl border-[3px] border-ink ${accentClass} p-5 shadow-brutalSm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-black text-ink/58">{title}</div>
        <SourceBadge source={source} />
      </div>
      <div className="mt-5 break-words text-2xl font-black leading-tight">{value}</div>
      <p className="mt-3 text-sm font-semibold leading-6 text-ink/62">{detail}</p>
    </div>
  );
}

function MetricRow({ label, value, source }: { label: string; value: string; source: SourceKind }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[3px] border-ink bg-white/72 p-4 shadow-brutalSm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-black text-ink/56">{label}</div>
        <div className="mt-1 break-words text-xl font-black">{value}</div>
      </div>
      <SourceBadge source={source} />
    </div>
  );
}

function CohortTile({ cohort, count, pulse, volume }: { cohort: Cohort; count: number; pulse: string; volume: number }) {
  return (
    <div className="rounded-3xl border-[3px] border-ink bg-white/72 p-5 shadow-brutalSm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-black text-ink/58">{cohort}</div>
        <SourceBadge source="Private FHE Snapshot" />
      </div>
      <div className="mt-5 break-words text-3xl font-black">{count}</div>
      <p className="mt-1 text-sm font-black text-ink/58">encrypted signals</p>
      <div className="mt-4 h-4 overflow-hidden rounded-full border-2 border-ink bg-ink/10">
        <div className="h-full bg-cyanpop" style={{ width: `${volume}%` }} />
      </div>
      <p className="mt-3 text-sm font-semibold text-ink/60">{pulse}. Aggregate cohort pulse only.</p>
    </div>
  );
}

function HealthComposition({ snapshot }: { snapshot: ReturnType<typeof buildSnapshot> }) {
  const items = [
    ["Health score", snapshot.healthScore, "bg-limepop"],
    ["Governance confidence", snapshot.daoPct, "bg-pinkpop"],
    ["Public participation", Number.parseInt(snapshot.publicParticipation, 10), "bg-cyanpop"],
    ["Influence watch", 64, "bg-orangepop"]
  ] as const;

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-4">
      {items.map(([label, value, color]) => (
        <div key={label} className="rounded-3xl border-[3px] border-ink bg-white/72 p-4 shadow-brutalSm">
          <div className="text-sm font-black text-ink/56">{label}</div>
          <div className="mt-3 text-3xl font-black">{value}%</div>
          <div className="mt-4 h-4 overflow-hidden rounded-full border-2 border-ink bg-ink/10">
            <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RiskDistribution({ snapshot }: { snapshot: ReturnType<typeof buildSnapshot> }) {
  const buckets = [
    ["Low", snapshot.riskBuckets.low, "bg-limepop"],
    ["Medium", snapshot.riskBuckets.medium, "bg-orangepop"],
    ["High", snapshot.riskBuckets.high, "bg-pinkpop"]
  ] as const;
  const total = Math.max(1, snapshot.riskBuckets.low + snapshot.riskBuckets.medium + snapshot.riskBuckets.high);

  return (
    <div className="mt-6 grid gap-4">
      <div className="rounded-3xl border-[3px] border-ink bg-white/72 p-5 shadow-brutalSm">
        <div className="flex h-8 overflow-hidden rounded-full border-2 border-ink bg-white">
          {buckets.map(([label, value, color]) => (
            <div key={label} className={`${color} h-full`} style={{ width: `${(value / total) * 100}%` }} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {buckets.map(([label, value, color]) => (
            <div key={label} className="rounded-2xl border-2 border-ink bg-white/80 p-3 shadow-brutalSm">
              <div className={`mb-2 h-3 w-10 rounded-full border border-ink ${color}`} />
              <div className="text-sm font-black text-ink/56">{label}</div>
              <div className="text-2xl font-black">{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        {["No individual risky wallets displayed", "No raw risk scores displayed", "Only aggregate pressure levels are visible"].map((item) => (
          <div key={item} className="rounded-2xl border-[3px] border-ink bg-white/72 p-4 text-sm font-black text-ink/70 shadow-brutalSm">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowStrip() {
  return (
    <div className="mt-6 grid gap-2 rounded-3xl border-[3px] border-ink bg-white/58 p-3 shadow-brutalSm backdrop-blur sm:grid-cols-5">
      {["Public Metrics", "Private Signals", "Batched Encryption", "FHE Snapshot", "Shared Dashboard"].map((item) => (
        <div key={item} className="rounded-2xl border-2 border-ink bg-white/74 px-3 py-3 text-center text-xs font-black text-ink/72 shadow-brutalSm">
          {item}
        </div>
      ))}
    </div>
  );
}

function MiniProof({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border-[3px] border-ink bg-white/74 p-4 shadow-brutalSm">
      <div className="text-xs font-black text-ink/52">{label}</div>
      <div className="mt-1 break-words text-lg font-black">{value}</div>
    </div>
  );
}

function SimpleBars({ labels, values, pending }: { labels: string[]; values: number[]; pending: boolean }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-6 grid gap-4">
      {labels.map((label, index) => (
        <div key={label}>
          <div className="flex items-center justify-between text-sm font-black text-ink/62">
            <span>{label}</span>
            <span>{pending ? "Snapshot pending" : `${values[index]}%`}</span>
          </div>
          <div className="mt-2 h-7 overflow-hidden rounded-full border-2 border-ink bg-white/70 shadow-brutalSm">
            <div className={`h-full ${index === 0 ? "bg-limepop" : index === 1 ? "bg-pinkpop" : "bg-cyanpop"}`} style={{ width: `${pending ? 18 : Math.max(5, (values[index] / max) * 100)}%` }} />
          </div>
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
