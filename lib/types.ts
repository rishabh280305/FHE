export const cohorts = ["Builders", "Whales", "Delegates", "New Users"] as const;

export type Cohort = (typeof cohorts)[number];
export type HealthStatus = "Green" | "Amber" | "Red";
export type ScoreBucket = "LOW" | "MED" | "HIGH";
export type DaoSentiment = "yes" | "no";

export type SignalFormValues = {
  cohort: Cohort;
  activityAmount: number;
  riskScore: number;
  daoVote: DaoSentiment;
  kpiValue: number;
};

export type PrivateScoreValues = {
  activity: number;
  consistency: number;
  risk: number;
};

export type CipherHandle = {
  id: string;
  handle: string;
  kind: "activity" | "risk" | "vote" | "kpi" | "score";
  createdAt: string;
};

export type SignalReceipt = {
  txId: string;
  cohort: Cohort;
  handles: CipherHandle[];
  metadata: string[];
  fhenixPayload?: {
    encryptedActivity: unknown;
    encryptedRisk: unknown;
  };
};

export type CohortMetric = {
  cohort: Cohort;
  users: number;
  volume: number;
  riskHigh: number;
  yesVotes: number;
  noVotes: number;
};

export type AnalyticsState = {
  totalSignals: number;
  ciphertextHandles: number;
  aggregateVolume: number;
  alertFired: boolean;
  health: HealthStatus;
  daoYesPct: number;
  riskBuckets: {
    low: number;
    medium: number;
    high: number;
  };
  cohorts: CohortMetric[];
  trend: number[];
  timeline: TimelineItem[];
  receipts: SignalReceipt[];
};

export type LiveMetricRead = {
  label: string;
  value: string;
  status: "not-configured" | "connected" | "no-submissions" | "pending" | "confirmed" | "encrypted" | "reveal-required" | "revealed" | "failed";
  detail?: string;
};

export type LiveAnalyticsRead = {
  contractConnected: boolean;
  contractAddress?: string;
  latestTransaction?: string;
  latestReadStatus: string;
  latestRevealStatus: string;
  submissionCount: number;
  seededCount?: number;
  successfulTxCount?: number;
  failedTxCount?: number;
  activeCohorts?: number;
  encryptedAggregateExists: boolean;
  authorizedRevealRequired: boolean;
  authorizedRevealer?: boolean;
  revealAvailable?: boolean;
  readError?: string;
  revealError?: string;
  metrics: LiveMetricRead[];
  cohortStatus: Record<Cohort, string>;
  handles: Record<string, string>;
};

export type SeedProgress = {
  phase: "idle" | "encrypting" | "submitting" | "confirmed" | "revealing" | "complete" | "failed";
  current: number;
  total: number;
  successful: number;
  failed: number;
  latestTx?: string;
  message: string;
  txHashes: string[];
};

export type TimelineItem = {
  step: string;
  detail: string;
  status: "done" | "live" | "queued";
};

export type WalletState = {
  address?: string;
  chainId?: number;
  connected: boolean;
};

export type NetworkStatus = {
  walletConnected: boolean;
  walletAddress?: string;
  walletChainId?: number;
  expectedChainId?: number;
  contractAddress?: string;
  rpcConfigured: boolean;
  fhenixSdkLoaded: boolean;
  liveModeAvailable: boolean;
  contractConfigured: boolean;
  liveReady: boolean;
  statusText: string;
  networkLabel: string;
  message: string;
};
