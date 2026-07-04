import type { Cohort, SignalFormValues } from "./types";

export type SimulatorAggregate = {
  encryptedSignals: number;
  activeWallets: number;
  transactions: number;
  proposals: number;
  sentiment: { support: number; against: number; abstain: number };
  cohorts: Record<Cohort, number>;
  risk: { low: number; medium: number; high: number };
  volume: number;
  whaleWeight: number;
  kpiAlerts: number;
};

export const SIMULATOR_STORAGE_KEY = "cipherpulse-simulator-aggregate-v1";

export const defaultSimulatorAggregate: SimulatorAggregate = {
  encryptedSignals: 30,
  activeWallets: 12840,
  transactions: 48920,
  proposals: 12,
  sentiment: { support: 20, against: 7, abstain: 3 },
  cohorts: {
    Contributors: 10,
    Delegates: 7,
    Whales: 6,
    "New Users": 7
  },
  risk: { low: 12, medium: 11, high: 7 },
  volume: 18420,
  whaleWeight: 42,
  kpiAlerts: 4
};

export function deriveSimulatorAnalytics(aggregate: SimulatorAggregate) {
  const sentimentTotal = Math.max(1, aggregate.sentiment.support + aggregate.sentiment.against + aggregate.sentiment.abstain);
  const supportPct = Math.round((aggregate.sentiment.support / sentimentTotal) * 100);
  const againstPct = Math.round((aggregate.sentiment.against / sentimentTotal) * 100);
  const abstainPct = Math.max(0, 100 - supportPct - againstPct);
  const riskTotal = Math.max(1, aggregate.risk.low + aggregate.risk.medium + aggregate.risk.high);
  const highRiskPct = Math.round((aggregate.risk.high / riskTotal) * 100);
  const mediumRiskPct = Math.round((aggregate.risk.medium / riskTotal) * 100);
  const healthScore = Math.max(0, Math.min(100, Math.round(55 + supportPct * 0.35 - highRiskPct * 0.45 - aggregate.whaleWeight * 0.12 + Math.min(12, aggregate.activeWallets / 1800))));
  const health = healthScore >= 82 ? "Green" : healthScore >= 68 ? "Green-Amber" : healthScore >= 52 ? "Amber" : "Red";
  const riskPressure = highRiskPct >= 30 ? "High" : highRiskPct >= 18 || mediumRiskPct >= 38 ? "Amber" : "Low";
  const whaleInfluence = aggregate.whaleWeight >= 70 ? "High" : aggregate.whaleWeight >= 35 ? "Medium" : "Low";
  const participationQuality = supportPct >= 64 && highRiskPct < 30 ? "Healthy" : highRiskPct > 35 ? "Concentrated" : "Watchlist";
  return { supportPct, againstPct, abstainPct, health, healthScore, riskPressure, whaleInfluence, participationQuality };
}

export function toDashboardSeed(aggregate: SimulatorAggregate) {
  const analytics = deriveSimulatorAnalytics(aggregate);
  return {
    health: analytics.health,
    healthScore: analytics.healthScore,
    healthDetail:
      analytics.health === "Green" || analytics.health === "Green-Amber"
        ? "Support is strong and activity is rising, while whale influence and risk pressure stay within the watch zone."
        : analytics.health === "Amber"
          ? "Community participation is active, but risk pressure and influence concentration need monitoring."
          : "Private risk pressure and influence concentration are elevated.",
    governancePositive: analytics.supportPct,
    governanceAgainst: analytics.againstPct,
    governanceAbstain: analytics.abstainPct,
    activityTrend: aggregate.transactions >= 50000 ? "+22% weekly" : aggregate.transactions >= 45000 ? "+18% weekly" : "+9% weekly",
    activeWallets: formatNumber(aggregate.activeWallets),
    transactionCount: formatNumber(aggregate.transactions),
    proposalCount: String(aggregate.proposals),
    publicParticipation: `${Math.min(96, Math.max(28, Math.round(aggregate.activeWallets / 180)))}%`,
    contributorActivity: formatNumber(Math.round(aggregate.volume / 14)),
    whaleInfluence: analytics.whaleInfluence,
    riskPressure: analytics.riskPressure,
    riskBuckets: aggregate.risk,
    alertStatus: aggregate.kpiAlerts >= 8 ? "Red" : aggregate.kpiAlerts >= 3 ? "Amber" : "Green",
    participationQuality: analytics.participationQuality,
    lastSnapshot: "Simulator snapshot active",
    nextSnapshot: "Updates instantly in simulator",
    cohorts: [
      { cohort: "Contributors" as Cohort, count: aggregate.cohorts.Contributors, pulse: aggregate.cohorts.Contributors >= 10 ? "High confidence" : "Developing", volume: clampPercent(aggregate.cohorts.Contributors * 4) },
      { cohort: "Delegates" as Cohort, count: aggregate.cohorts.Delegates, pulse: aggregate.cohorts.Delegates >= 7 ? "Constructive" : "Thin coverage", volume: clampPercent(aggregate.cohorts.Delegates * 4) },
      { cohort: "Whales" as Cohort, count: aggregate.cohorts.Whales, pulse: analytics.whaleInfluence === "High" ? "High influence" : "Medium influence", volume: clampPercent(aggregate.cohorts.Whales * 5) },
      { cohort: "New Users" as Cohort, count: aggregate.cohorts["New Users"], pulse: aggregate.cohorts["New Users"] >= 7 ? "Growing" : "Early", volume: clampPercent(aggregate.cohorts["New Users"] * 4) }
    ]
  };
}

export function applySignalToAggregate(current: SimulatorAggregate, signal: SignalFormValues): SimulatorAggregate {
  const riskBucket = signal.riskScore >= 70 ? "high" : signal.riskScore >= 35 ? "medium" : "low";
  const whaleDelta = signal.cohort === "Whales" ? 3 : signal.activityAmount > 800 ? 2 : 0;
  return {
    encryptedSignals: current.encryptedSignals + 1,
    activeWallets: current.activeWallets + (signal.cohort === "New Users" ? 3 : 1),
    transactions: current.transactions + Math.max(1, Math.round(signal.activityAmount / 18)),
    proposals: current.proposals,
    sentiment: {
      support: current.sentiment.support + (signal.daoVote === "yes" ? 1 : 0),
      against: current.sentiment.against + (signal.daoVote === "no" ? 1 : 0),
      abstain: current.sentiment.abstain + (signal.kpiValue < 20 ? 1 : 0)
    },
    cohorts: {
      ...current.cohorts,
      [signal.cohort]: current.cohorts[signal.cohort] + 1
    },
    risk: {
      ...current.risk,
      [riskBucket]: current.risk[riskBucket] + 1
    },
    volume: current.volume + signal.activityAmount,
    whaleWeight: Math.min(100, current.whaleWeight + whaleDelta),
    kpiAlerts: current.kpiAlerts + (signal.kpiValue >= 75 ? 1 : 0)
  };
}

export function readStoredSimulatorAggregate() {
  if (typeof window === "undefined") return defaultSimulatorAggregate;
  try {
    const stored = window.localStorage.getItem(SIMULATOR_STORAGE_KEY);
    return stored ? sanitizeAggregate(JSON.parse(stored)) : defaultSimulatorAggregate;
  } catch {
    return defaultSimulatorAggregate;
  }
}

export function writeStoredSimulatorAggregate(aggregate: SimulatorAggregate) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(sanitizeAggregate(aggregate)));
}

export function sanitizeAggregate(input: Partial<SimulatorAggregate>): SimulatorAggregate {
  return {
    encryptedSignals: clampNumber(input.encryptedSignals, 0, 100000, defaultSimulatorAggregate.encryptedSignals),
    activeWallets: clampNumber(input.activeWallets, 0, 10000000, defaultSimulatorAggregate.activeWallets),
    transactions: clampNumber(input.transactions, 0, 100000000, defaultSimulatorAggregate.transactions),
    proposals: clampNumber(input.proposals, 0, 10000, defaultSimulatorAggregate.proposals),
    sentiment: {
      support: clampNumber(input.sentiment?.support, 0, 100000, defaultSimulatorAggregate.sentiment.support),
      against: clampNumber(input.sentiment?.against, 0, 100000, defaultSimulatorAggregate.sentiment.against),
      abstain: clampNumber(input.sentiment?.abstain, 0, 100000, defaultSimulatorAggregate.sentiment.abstain)
    },
    cohorts: {
      Contributors: clampNumber(input.cohorts?.Contributors, 0, 100000, defaultSimulatorAggregate.cohorts.Contributors),
      Delegates: clampNumber(input.cohorts?.Delegates, 0, 100000, defaultSimulatorAggregate.cohorts.Delegates),
      Whales: clampNumber(input.cohorts?.Whales, 0, 100000, defaultSimulatorAggregate.cohorts.Whales),
      "New Users": clampNumber(input.cohorts?.["New Users"], 0, 100000, defaultSimulatorAggregate.cohorts["New Users"])
    },
    risk: {
      low: clampNumber(input.risk?.low, 0, 100000, defaultSimulatorAggregate.risk.low),
      medium: clampNumber(input.risk?.medium, 0, 100000, defaultSimulatorAggregate.risk.medium),
      high: clampNumber(input.risk?.high, 0, 100000, defaultSimulatorAggregate.risk.high)
    },
    volume: clampNumber(input.volume, 0, 100000000, defaultSimulatorAggregate.volume),
    whaleWeight: clampNumber(input.whaleWeight, 0, 100, defaultSimulatorAggregate.whaleWeight),
    kpiAlerts: clampNumber(input.kpiAlerts, 0, 100000, defaultSimulatorAggregate.kpiAlerts)
  };
}

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
};

const clampPercent = (value: number) => Math.max(8, Math.min(100, value));

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);
