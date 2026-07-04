import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import type { AnalyticsState, Cohort, LiveAnalyticsRead, LiveMetricRead, NetworkStatus, SeedProgress, SignalFormValues, SignalReceipt, WalletState } from "./types";

const encryptedInputTuple = "tuple(uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature)";
const contractAbi = [
  `function submitFullSignal(${encryptedInputTuple} encryptedActivity, ${encryptedInputTuple} encryptedRisk, ${encryptedInputTuple} encryptedVoteOrSentiment, ${encryptedInputTuple} encryptedKpi, uint8 cohort, uint32 publicAlertThreshold) external`,
  `function submitWalletSignal(${encryptedInputTuple} encryptedActivity, ${encryptedInputTuple} encryptedRisk, uint8 cohort) external`,
  "function owner() external view returns (address)",
  "function analysts(address) external view returns (bool)",
  "function requestMetricReveal(uint8 metric, uint8 cohort) external returns (bytes32 handle)",
  "function allowMetricToSender(uint8 metric, uint8 cohort) external returns (bytes32 handle)",
  "function getDecryptResultSafe(uint8 metric, uint8 cohort) external view returns (uint256 value, bool ready)",
  "function metricHandle(uint8 metric, uint8 cohort) external view returns (bytes32)",
  "event FullSignalSubmitted(address indexed sender,uint8 indexed cohort,bytes32 activityHandle,bytes32 riskHandle,bytes32 voteHandle,bytes32 kpiHandle,bytes32 alertHandle)",
  "event MetricRevealAuthorized(address indexed requester,uint8 indexed metric,uint8 indexed cohort,bytes32 handle)"
];

const cohortIndex = ["Contributors", "Delegates", "Whales", "New Users"] as const;
const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111;
const ETHEREUM_SEPOLIA_HEX_CHAIN_ID = "0xaa36a7";
const ETHEREUM_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const ETHEREUM_SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
const EUINT32_UTYPE = 4;
const EBOOL_UTYPE = 0;
const ALERT_THRESHOLD = 75;
const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

export const getContractAddress = () => process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim();
const getRpcUrl = () => process.env.NEXT_PUBLIC_RPC_URL?.trim();
const getLastSignalTx = () => process.env.NEXT_PUBLIC_LAST_SIGNAL_TX?.trim();
const getExpectedChainId = () => {
  const value = process.env.NEXT_PUBLIC_CHAIN_ID?.trim();
  return value ? Number(value) : ETHEREUM_SEPOLIA_CHAIN_ID;
};

export const isContractConfigured = () => Boolean(getContractAddress() && getRpcUrl() && getExpectedChainId());

const chainLabel = (chainId?: number) => {
  if (chainId === 11155111) return "Live on Ethereum Sepolia";
  return chainId ? `Live on chain ${chainId}` : "Contract not configured";
};

type CofheWebModule = {
  createCofheConfig: (config: { supportedChains: unknown[]; useWorkers?: boolean }) => unknown;
  createCofheClient: (config: unknown) => {
    connect: (publicClient: unknown, walletClient: unknown) => Promise<void>;
    encryptInputs: (inputs: unknown[]) => {
      setAccount: (account: string) => unknown;
      setChainId: (chainId: number) => unknown;
      setSecurityZone: (securityZone: number) => unknown;
      setUseWorker?: (useWorker: boolean) => unknown;
      execute: () => Promise<EncryptedInput[]>;
    };
    decryptForView: (ctHash: bigint | string, utype: number) => {
      setChainId: (chainId: number) => unknown;
      setAccount: (account: string) => unknown;
      withPermit: () => unknown;
      set404RetryTimeout?: (timeoutMs: number) => unknown;
      execute: () => Promise<bigint | number | string | boolean>;
    };
    permits?: {
      getOrCreateSelfPermit: (chainId?: number, account?: string) => Promise<unknown>;
      selectActivePermit?: (hash: string, chainId?: number, account?: string) => void;
      getHash?: (permit: unknown) => string;
    };
  };
};

type CofheChainsModule = {
  sepolia: unknown;
};

type CofheAdaptersModule = {
  Ethers6Adapter: (provider: BrowserProvider, signer: Awaited<ReturnType<BrowserProvider["getSigner"]>>) => Promise<{
    publicClient: unknown;
    walletClient: unknown;
  }>;
};

type LoadedFhenixSdk = {
  loaded: boolean;
  web?: CofheWebModule;
  chains?: CofheChainsModule;
  adapters?: CofheAdaptersModule;
};

type EncryptedInput = {
  ctHash: bigint | string | number;
  securityZone: number;
  utype: number;
  signature: string;
};

let sdkPromise: Promise<LoadedFhenixSdk> | undefined;

const importSdkModule = async <T>(bareSpecifier: string): Promise<T> => {
  if (bareSpecifier === "@cofhe/sdk/web") {
    return (await import("@cofhe/sdk/web")) as T;
  }
  if (bareSpecifier === "@cofhe/sdk/chains") {
    return (await import("@cofhe/sdk/chains")) as T;
  }
  if (bareSpecifier === "@cofhe/sdk/adapters") {
    return (await import("@cofhe/sdk/adapters")) as T;
  }
  throw new Error(`Unsupported SDK module: ${bareSpecifier}`);
};

const loadFhenixSdk = async (): Promise<LoadedFhenixSdk> => {
  if (typeof window === "undefined") return { loaded: false };
  if (sdkPromise) return sdkPromise;

  sdkPromise = (async () => {
    try {
      const [web, chains, adapters] = await Promise.all([
        importSdkModule<CofheWebModule>("@cofhe/sdk/web"),
        importSdkModule<CofheChainsModule>("@cofhe/sdk/chains"),
        importSdkModule<CofheAdaptersModule>("@cofhe/sdk/adapters")
      ]);

      return {
        loaded:
          typeof web.createCofheClient === "function" &&
          typeof web.createCofheConfig === "function" &&
          typeof adapters.Ethers6Adapter === "function" &&
          Boolean(chains.sepolia),
        web,
        chains,
        adapters
      };
    } catch {
      return { loaded: false };
    }
  })();

  return sdkPromise;
};

const buildEncryptedInputsWithSdk = async (
  sdk: LoadedFhenixSdk,
  values: SignalFormValues,
  provider: BrowserProvider,
  signer: Awaited<ReturnType<BrowserProvider["getSigner"]>>,
  account: string,
  chainId: number
): Promise<{
  encryptedActivity: readonly [bigint, number, number, string];
  encryptedRisk: readonly [bigint, number, number, string];
  encryptedVote: readonly [bigint, number, number, string];
  encryptedKpi: readonly [bigint, number, number, string];
}> => {
  if (!sdk.loaded || !sdk.web || !sdk.chains?.sepolia || !sdk.adapters) {
    throw new Error("Fhenix browser adapter is not available in this session.");
  }

  const client = await createConnectedCofheClient(sdk, provider, signer);
  const builder = client.encryptInputs([
    { data: BigInt(values.activityAmount), securityZone: 0, utype: EUINT32_UTYPE },
    { data: BigInt(values.riskScore), securityZone: 0, utype: EUINT32_UTYPE },
    { data: values.daoVote === "yes", securityZone: 0, utype: EBOOL_UTYPE },
    { data: BigInt(values.kpiValue), securityZone: 0, utype: EUINT32_UTYPE }
  ]);

  builder.setAccount(account);
  builder.setChainId(chainId);
  builder.setSecurityZone(0);
  builder.setUseWorker?.(false);

  const [activity, risk, vote, kpi] = await builder.execute();
  return {
    encryptedActivity: toSolidityInput(activity),
    encryptedRisk: toSolidityInput(risk),
    encryptedVote: toSolidityInput(vote),
    encryptedKpi: toSolidityInput(kpi)
  };
};

const createConnectedCofheClient = async (
  sdk: LoadedFhenixSdk,
  provider: BrowserProvider,
  signer: Awaited<ReturnType<BrowserProvider["getSigner"]>>
) => {
  if (!sdk.loaded || !sdk.web || !sdk.chains?.sepolia || !sdk.adapters) {
    throw new Error("Fhenix browser adapter is not available in this session.");
  }

  const config = sdk.web.createCofheConfig({
    supportedChains: [sdk.chains.sepolia],
    useWorkers: false
  });
  const client = sdk.web.createCofheClient(config);
  const { publicClient, walletClient } = await sdk.adapters.Ethers6Adapter(provider, signer);
  await client.connect(publicClient, walletClient);
  return client;
};

const toSolidityInput = (input: EncryptedInput): readonly [bigint, number, number, string] => [
  BigInt(input.ctHash),
  Number(input.securityZone),
  Number(input.utype),
  input.signature
];

export const connectWallet = async (): Promise<WalletState> => {
  if (typeof window === "undefined" || !window.ethereum) {
    return { connected: false };
  }

  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  let network = await provider.getNetwork();

  if (Number(network.chainId) !== ETHEREUM_SEPOLIA_CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ETHEREUM_SEPOLIA_HEX_CHAIN_ID }]
      });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: number }).code : undefined;
      if (code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: ETHEREUM_SEPOLIA_HEX_CHAIN_ID,
              chainName: "Ethereum Sepolia",
              rpcUrls: [ETHEREUM_SEPOLIA_RPC_URL],
              nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
              blockExplorerUrls: [ETHEREUM_SEPOLIA_EXPLORER]
            }
          ]
        });
      }
    }
    network = await provider.getNetwork();
  }

  const signer = await provider.getSigner();

  return {
    connected: true,
    address: await signer.getAddress(),
    chainId: Number(network.chainId)
  };
};

export const getRuntimeStatus = async (wallet?: WalletState): Promise<NetworkStatus> => {
  const contractAddress = getContractAddress();
  const expectedChainId = getExpectedChainId();
  const contractConfigured = isContractConfigured();
  const sdkStatus = contractConfigured ? await loadFhenixSdk() : { loaded: false };
  const walletConnected = Boolean(wallet?.connected);
  const chainMatches = Boolean(wallet?.chainId && expectedChainId && wallet.chainId === expectedChainId);
  const liveReady = Boolean(contractConfigured && walletConnected && chainMatches && sdkStatus.loaded);

  return {
    walletConnected,
    walletAddress: wallet?.address,
    walletChainId: wallet?.chainId,
    expectedChainId,
    contractAddress,
    rpcConfigured: Boolean(getRpcUrl()),
    fhenixSdkLoaded: Boolean(sdkStatus.loaded),
    liveModeAvailable: liveReady,
    contractConfigured,
    liveReady,
    statusText: !contractConfigured ? "Contract pending deployment" : walletConnected ? "Wallet connected" : "Not connected",
    networkLabel: contractConfigured ? chainLabel(expectedChainId) : "Ethereum Sepolia target",
    message: !contractConfigured
      ? "Live contract is pending deployment. Once configured, CipherPulse will stream encrypted aggregate analytics from Ethereum Sepolia."
      : !walletConnected
        ? "Connect wallet to submit encrypted signals."
        : !chainMatches
          ? `Switch wallet to chain ${expectedChainId}.`
          : sdkStatus.loaded
            ? "Live Fhenix adapter is ready."
            : "Fhenix SDK adapter is not available in this browser session."
  };
};

export const getLiveModeStatus = getRuntimeStatus;

export const isCorrectNetwork = (wallet?: WalletState) => Boolean(wallet?.chainId && wallet.chainId === getExpectedChainId());

export const getContractInstance = (providerOrSigner?: BrowserProvider | JsonRpcProvider | Awaited<ReturnType<BrowserProvider["getSigner"]>>) => {
  if (!isContractConfigured()) throw new Error("Contract not configured yet.");
  return new Contract(getContractAddress()!, contractAbi, providerOrSigner ?? new JsonRpcProvider(getRpcUrl()!));
};

export const isAuthorizedRevealer = async (address?: string) => {
  if (!address || !isContractConfigured()) return false;
  try {
    const contract = getContractInstance();
    const [owner, analyst] = await Promise.all([contract.owner(), contract.analysts(address)]);
    return String(owner).toLowerCase() === address.toLowerCase() || Boolean(analyst);
  } catch {
    return false;
  }
};

export const encryptAndSubmitSignal = async (values: SignalFormValues) => {
  if (!isContractConfigured()) {
    throw new Error("Contract not configured yet.");
  }
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Connect wallet to submit encrypted signal.");
  }

  const sdkStatus = await loadFhenixSdk();
  if (!sdkStatus.loaded) {
    throw new Error("Fhenix SDK adapter is not available. Contract submission was not sent.");
  }

  const provider = new BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  const expectedChainId = getExpectedChainId();
  if (Number(network.chainId) !== expectedChainId) {
    throw new Error("Switch wallet to Ethereum Sepolia before submitting.");
  }

  const signer = await provider.getSigner();
  let encryptedInputs: Awaited<ReturnType<typeof buildEncryptedInputsWithSdk>>;
  try {
    encryptedInputs = await buildEncryptedInputsWithSdk(sdkStatus, values, provider, signer, await signer.getAddress(), expectedChainId);
  } catch (error) {
    throw new Error(`Fhenix encryption failed: ${getErrorMessage(error)}`);
  }
  const contract = new Contract(getContractAddress()!, contractAbi, signer);
  const cohort = cohortIndex.indexOf(values.cohort);
  const tx = await contract.submitFullSignal(
    encryptedInputs.encryptedActivity,
    encryptedInputs.encryptedRisk,
    encryptedInputs.encryptedVote,
    encryptedInputs.encryptedKpi,
    cohort,
    ALERT_THRESHOLD
  );
  const receipt = await tx.wait();

  return {
    txHash: receipt?.hash ?? tx.hash
  };
};

export const readLiveAggregates = async (): Promise<AnalyticsState | undefined> => {
  const live = await readAggregateMetrics();
  const revealed = live.metrics.some((metric) => metric.status === "revealed");
  if (!revealed) return undefined;

  return {
    totalSignals: numberFromMetric(live.metrics[0]),
    ciphertextHandles: Object.values(live.handles).filter((handle) => handle !== ZERO_HANDLE).length,
    aggregateVolume: numberFromMetric(live.metrics[2]),
    alertFired: live.metrics[5]?.value === "Alert fired",
    health: live.metrics[6]?.value === "Green" || live.metrics[6]?.value === "Amber" || live.metrics[6]?.value === "Red" ? live.metrics[6].value : "Amber",
    daoYesPct: numberFromMetric(live.metrics[3]),
    riskBuckets: { low: 0, medium: 0, high: numberFromMetric(live.metrics[4]) },
    cohorts: cohortsFromRead(live),
    trend: cohortsFromRead(live).map((cohort) => cohort.users),
    timeline: [],
    receipts: []
  };
};

export const readAggregateMetrics = async (wallet?: WalletState): Promise<LiveAnalyticsRead> => {
  const base = createBaseRead();
  if (!isContractConfigured()) {
    return {
      ...base,
      latestReadStatus: "Contract not deployed/configured",
      metrics: statusMetrics("Contract not configured", "not-configured")
    };
  }

  try {
    const provider = new JsonRpcProvider(getRpcUrl()!);
    const contractAddress = getContractAddress()!;
    const code = await provider.getCode(contractAddress);
    if (code === "0x") {
      return {
        ...base,
        contractAddress,
        latestReadStatus: "Contract address has no deployed bytecode",
        readError: "No bytecode found at configured contract address.",
        metrics: statusMetrics("Contract read failed", "failed")
      };
    }

    const contract = new Contract(contractAddress, contractAbi, provider);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 5000);
    const signalEvents = await contract.queryFilter(contract.filters.FullSignalSubmitted(), fromBlock, latestBlock).catch(() => []);
    const revealEvents = await contract.queryFilter(contract.filters.MetricRevealAuthorized(), fromBlock, latestBlock).catch(() => []);
    const handles = await readMetricHandles(contract);
    const nonZeroHandles = Object.values(handles).filter((handle) => handle.startsWith("0x") && handle !== ZERO_HANDLE).length;
    const activeCohorts = cohortIndex.filter((_, index) => handles[`users:${index}`]?.startsWith("0x") && handles[`users:${index}`] !== ZERO_HANDLE).length;
    const encryptedAggregateExists = signalEvents.length > 0 || nonZeroHandles > 0;
    const latestTransaction = signalEvents.at(-1)?.transactionHash ?? getLastSignalTx();
    const authorizedRevealer = await isAuthorizedRevealer(wallet?.address);

    if (!encryptedAggregateExists) {
      return {
        ...base,
        contractConnected: true,
        contractAddress,
        latestReadStatus: "Contract connected, no submissions yet",
        latestRevealStatus: revealEvents.length ? "Reveal requested, awaiting encrypted aggregate" : "No reveal requested yet",
        submissionCount: 0,
        activeCohorts: 0,
        authorizedRevealer,
        handles,
        metrics: statusMetrics("Contract connected, no submissions yet", "no-submissions")
      };
    }

    const decryptRead = await tryReadDecryptResults(wallet);
    if (decryptRead.ok && decryptRead.metrics.some((metric) => metric.status === "revealed")) {
      return {
        ...base,
        contractConnected: true,
        contractAddress,
        latestTransaction,
        latestReadStatus: "Aggregate revealed",
        latestRevealStatus: "Aggregate revealed",
        submissionCount: signalEvents.length || Number(decryptRead.metrics[0].value) || 1,
        seededCount: signalEvents.length,
        successfulTxCount: signalEvents.length,
        activeCohorts,
        encryptedAggregateExists: true,
        authorizedRevealRequired: false,
        authorizedRevealer,
        revealAvailable: true,
        handles,
        metrics: decryptRead.metrics,
        cohortStatus: decryptRead.cohortStatus
      };
    }

    const revealRequiredStatus = decryptRead.ok
      ? "Encrypted aggregate updated; plaintext reveal pending"
      : decryptRead.error;
    const revealStatus = revealEvents.length
      ? "Reveal requested; waiting for CoFHE decrypt result"
      : authorizedRevealer
        ? "Authorized wallet connected; reveal can be requested"
        : "Connect owner/analyst wallet to reveal";

    return {
      ...base,
      contractConnected: true,
      contractAddress,
      latestTransaction,
      latestReadStatus: revealRequiredStatus,
      latestRevealStatus: revealStatus,
      submissionCount: signalEvents.length || 1,
      seededCount: signalEvents.length,
      successfulTxCount: signalEvents.length,
      activeCohorts,
      encryptedAggregateExists: true,
      authorizedRevealRequired: true,
      authorizedRevealer,
      revealAvailable: false,
      readError: decryptRead.ok ? undefined : decryptRead.error,
      handles,
      metrics: encryptedStateMetrics({
        signalEvents: signalEvents.length,
        nonZeroHandles,
        activeCohorts,
        latestRevealStatus: revealStatus
      }),
      cohortStatus: Object.fromEntries(
        cohortIndex.map((cohort, index) => [
          cohort,
          handles[`users:${index}`]?.startsWith("0x") && handles[`users:${index}`] !== ZERO_HANDLE
            ? "Encrypted aggregate updated"
            : "No encrypted submissions detected"
        ])
      ) as Record<Cohort, string>
    };
  } catch (error) {
    return {
      ...base,
      latestReadStatus: `Read failed: ${getErrorMessage(error)}`,
      readError: getErrorMessage(error),
      metrics: statusMetrics(`Read failed: ${getErrorMessage(error)}`, "failed")
    };
  }
};

export const readCohortMetrics = readAggregateMetrics;
export const readDaoPulse = readAggregateMetrics;
export const readAlertStatus = readAggregateMetrics;
export const readHealthScore = readAggregateMetrics;

export const requestAuthorizedReveal = async (metric = 0, cohort = 0) => {
  if (!isContractConfigured()) {
    throw new Error("Contract not configured yet.");
  }
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Connect wallet to request authorized reveal.");
  }

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(getContractAddress()!, contractAbi, signer);
  const allowTx = await contract.allowMetricToSender(metric, cohort);
  await allowTx.wait();
  const tx = await contract.requestMetricReveal(metric, cohort);
  const receipt = await tx.wait();
  return {
    txHash: receipt?.hash ?? tx.hash,
    message: "Reveal authorization recorded on-chain. CoFHE decrypt/unseal is being checked for plaintext aggregate availability."
  };
};

export const requestAggregateReveal = () => requestAuthorizedReveal(0, 0);
export const requestCohortReveal = (cohort = 0) => requestAuthorizedReveal(5, cohort);
export const requestDaoPulseReveal = (cohort = 0) => requestAuthorizedReveal(3, cohort);
export const requestRiskReveal = (cohort = 0) => requestAuthorizedReveal(2, cohort);
export const requestAlertReveal = () => requestAuthorizedReveal(6, 0);

export const refreshLiveAnalytics = async ({ autoReveal = false, wallet }: { autoReveal?: boolean; wallet?: WalletState } = {}) => {
  let read = await readAggregateMetrics(wallet);
  if (!autoReveal || !wallet?.connected || !read.contractConnected || !read.authorizedRevealRequired || read.revealAvailable === true) {
    return read;
  }
  if (!(await isAuthorizedRevealer(wallet.address))) {
    return {
      ...read,
      latestRevealStatus: "Wallet not authorized to reveal",
      revealError: "Connect the owner/analyst wallet to auto reveal aggregate metrics."
    };
  }

  try {
    await requestAuthorizedReveal(0, 0);
    await requestAuthorizedReveal(1, 0);
    await requestAuthorizedReveal(2, 0);
    await requestAuthorizedReveal(3, 0);
    await requestAuthorizedReveal(4, 0);
    await requestAuthorizedReveal(6, 0);
    read = await readAggregateMetrics(wallet);
    return {
      ...read,
      latestRevealStatus: read.revealAvailable ? "Reveal complete" : "Reveal transaction confirmed; waiting for CoFHE decrypt result"
    };
  } catch (error) {
    return {
      ...read,
      latestRevealStatus: `Reveal failed: ${getErrorMessage(error)}`,
      revealError: getErrorMessage(error)
    };
  }
};

export const readRevealedDashboardMetrics = () => readAggregateMetrics();

export const seedEncryptedSignals = async (
  count = 30,
  onProgress?: (progress: SeedProgress) => void
): Promise<SeedProgress> => {
  const total = count;
  const txHashes: string[] = [];
  let successful = 0;
  let failed = 0;

  const emit = (progress: Partial<SeedProgress>) =>
    onProgress?.({
      phase: "idle",
      current: 0,
      total,
      successful,
      failed,
      txHashes: [...txHashes],
      message: "Preparing live encrypted seed.",
      ...progress
    });

  for (let index = 0; index < total; index += 1) {
    const signal = seedSignalAt(index);
    try {
      emit({ phase: "encrypting", current: index + 1, message: `Encrypting ${index + 1}/${total}` });
      emit({ phase: "submitting", current: index + 1, message: `Submitting ${index + 1}/${total}` });
      const receipt = await encryptAndSubmitSignal(signal);
      successful += 1;
      txHashes.push(receipt.txHash);
      emit({
        phase: "confirmed",
        current: index + 1,
        successful,
        latestTx: receipt.txHash,
        txHashes: [...txHashes],
        message: `Confirmed ${index + 1}/${total}`
      });
    } catch (error) {
      failed += 1;
      emit({
        phase: "failed",
        current: index + 1,
        successful,
        failed,
        txHashes: [...txHashes],
        message: `Seed ${index + 1}/${total} failed: ${getErrorMessage(error)}`
      });
      throw error;
    }
  }

  const done: SeedProgress = {
    phase: "complete",
    current: total,
    total,
    successful,
    failed,
    latestTx: txHashes.at(-1),
    message: `Confirmed ${successful}/${total}. Aggregate refresh can now run.`,
    txHashes
  };
  onProgress?.(done);
  return done;
};

const seedSignalAt = (index: number): SignalFormValues => {
  const cohortPlan: Cohort[] = [
    ...Array<Cohort>(10).fill("Contributors"),
    ...Array<Cohort>(7).fill("Delegates"),
    ...Array<Cohort>(6).fill("Whales"),
    ...Array<Cohort>(7).fill("New Users")
  ];
  const cohort = cohortPlan[index % cohortPlan.length];
  const isPositive = index % 3 !== 0;
  const highRisk = index % 5 === 0 || index % 11 === 0;
  const mediumRisk = index % 4 === 0;
  const activityBase = cohort === "Whales" ? 860 : cohort === "Contributors" ? 520 : cohort === "Delegates" ? 360 : 180;

  return {
    cohort,
    daoVote: isPositive ? "yes" : "no",
    activityAmount: activityBase + ((index * 37) % 140),
    riskScore: highRisk ? 78 + (index % 16) : mediumRisk ? 44 + (index % 18) : 12 + (index % 24),
    kpiValue: index % 6 === 0 ? 86 : 42 + ((index * 7) % 30)
  };
};

export const encryptSignal = async (_values: SignalFormValues): Promise<SignalReceipt> => {
  throw new Error("Production encryption requires the live Fhenix adapter path.");
};

export const submitEncryptedSignal = async (_receipt?: unknown): Promise<{ mode: "unavailable"; txHash?: string; message: string }> => {
  throw new Error("Production submissions must use encryptAndSubmitSignal().");
};

export const requestMetricReveal = requestAuthorizedReveal;

const createBaseRead = (): LiveAnalyticsRead => ({
  contractConnected: false,
  contractAddress: getContractAddress(),
  latestReadStatus: "Contract not configured",
  latestRevealStatus: "No reveal requested yet",
  submissionCount: 0,
  encryptedAggregateExists: false,
  authorizedRevealRequired: false,
  metrics: statusMetrics("Contract not configured", "not-configured"),
  cohortStatus: Object.fromEntries(cohortIndex.map((cohort) => [cohort, "Contract not configured"])) as Record<Cohort, string>,
  handles: {}
});

const statusMetrics = (value: string, status: LiveMetricRead["status"]): LiveMetricRead[] => [
  { label: "Encrypted submissions", value, status },
  { label: "Active cohorts", value, status },
  { label: "Aggregate volume", value, status },
  { label: "DAO pulse", value, status },
  { label: "Risk alerts", value, status },
  { label: "Alert status", value, status },
  { label: "Health score", value, status }
];

const encryptedStateMetrics = ({
  signalEvents,
  nonZeroHandles,
  activeCohorts,
  latestRevealStatus
}: {
  signalEvents: number;
  nonZeroHandles: number;
  activeCohorts: number;
  latestRevealStatus: string;
}): LiveMetricRead[] => [
  { label: "Encrypted submissions", value: signalEvents ? String(signalEvents) : "Encrypted records present", status: "encrypted" },
  { label: "Active cohorts", value: `${activeCohorts}/4 encrypted`, status: "encrypted" },
  { label: "Aggregate volume", value: nonZeroHandles ? "Encrypted handle ready" : "No volume handle yet", status: nonZeroHandles ? "encrypted" : "pending" },
  { label: "DAO pulse", value: nonZeroHandles ? "Encrypted yes/no handles ready" : "No DAO handle yet", status: nonZeroHandles ? "encrypted" : "pending" },
  { label: "Risk alerts", value: nonZeroHandles ? "Encrypted risk handle ready" : "No risk handle yet", status: nonZeroHandles ? "encrypted" : "pending" },
  { label: "Alert status", value: nonZeroHandles ? "Encrypted alert handle ready" : "No alert handle yet", status: nonZeroHandles ? "encrypted" : "pending" },
  { label: "Health score", value: latestRevealStatus, status: "reveal-required", detail: "Derived only after authorized aggregate reveal." }
];

const readMetricHandles = async (contract: Contract) => {
  const cohortPairs = cohortIndex.flatMap((_, cohort) =>
    [
      ["users", 0, cohort],
      ["volume", 1, cohort],
      ["riskHigh", 2, cohort],
      ["daoYes", 3, cohort],
      ["daoNo", 4, cohort],
      ["cohortMetric", 5, cohort]
    ] as const
  );
  const pairs = [...cohortPairs, ["alert", 6, 0] as const];
  const entries = await Promise.all(
    pairs.map(async ([key, metric, cohort]) => {
      try {
        return [`${key}:${cohort}`, await contract.metricHandle(metric, cohort)] as const;
      } catch (error) {
        return [`${key}:${cohort}`, `read failed: ${getErrorMessage(error)}`] as const;
      }
    })
  );
  return Object.fromEntries(entries);
};

const tryReadDecryptResults = async (wallet?: WalletState): Promise<{ ok: true; metrics: LiveMetricRead[]; cohortStatus: Record<Cohort, string> } | { ok: false; error: string }> => {
  if (!wallet?.connected) {
    return { ok: false, error: "Encrypted aggregate updated; connect owner/analyst wallet to reveal." };
  }
  if (typeof window === "undefined" || !window.ethereum) {
    return { ok: false, error: "Encrypted aggregate updated; wallet provider unavailable for authorized read." };
  }
  if (!(await isAuthorizedRevealer(wallet.address))) {
    return { ok: false, error: "Encrypted aggregate updated. Connected wallet is not authorized to reveal." };
  }

  try {
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new Contract(getContractAddress()!, contractAbi, signer);
    const cohortReads = await Promise.all(
      cohortIndex.map(async (_, cohort) => {
        const [users, volume, riskHigh, daoYes, daoNo, cohortMetric] = await Promise.all(
          [0, 1, 2, 3, 4, 5].map((metric) => contract.getDecryptResultSafe(metric, cohort))
        );
        return { users, volume, riskHigh, daoYes, daoNo, cohortMetric };
      })
    );
    const alert = await contract.getDecryptResultSafe(6, 0);
    const ready = cohortReads.some((read) =>
      [read.users, read.volume, read.riskHigh, read.daoYes, read.daoNo, read.cohortMetric].some((item) => Boolean(item[1]))
    ) || Boolean(alert[1]);

    if (!ready) {
      const sdkRead = await trySdkViewDecrypt(provider, signer, wallet.address);
      if (sdkRead.ok) return sdkRead;
      return { ok: false, error: sdkRead.error };
    }

    const total = (metric: keyof (typeof cohortReads)[number]) =>
      cohortReads.reduce((sum, read) => sum + (read[metric][1] ? Number(read[metric][0]) : 0), 0);
    const users = total("users");
    const volume = total("volume");
    const risk = total("riskHigh");
    const yes = total("daoYes");
    const no = total("daoNo");
    const daoPct = yes + no ? Math.round((yes / (yes + no)) * 100) : 0;
    const health = risk >= 8 ? "Red" : risk >= 3 ? "Amber" : "Green";
    const activeCohorts = cohortReads.filter((read) => read.users[1] && Number(read.users[0]) > 0).length;

    return {
      ok: true,
      metrics: [
        revealedMetric("Encrypted submissions", String(users)),
        revealedMetric("Active cohorts", String(activeCohorts)),
        revealedMetric("Aggregate volume", String(volume)),
        revealedMetric("DAO pulse", `${daoPct}% positive`),
        revealedMetric("Risk alerts", `${risk} high-risk`),
        revealedMetric("Alert status", alert[1] ? (Number(alert[0]) ? "Alert fired" : "No alert") : "Reveal pending"),
        revealedMetric("Health score", health)
      ],
      cohortStatus: Object.fromEntries(
        cohortIndex.map((cohort, index) => [
          cohort,
          cohortReads[index].users[1] ? `${Number(cohortReads[index].users[0])} encrypted records revealed` : "Reveal pending"
        ])
      ) as Record<Cohort, string>
    };
  } catch (error) {
    return { ok: false, error: `Read failed: ${getErrorMessage(error)}` };
  }
};

const trySdkViewDecrypt = async (
  provider: BrowserProvider,
  signer: Awaited<ReturnType<BrowserProvider["getSigner"]>>,
  account?: string
): Promise<{ ok: true; metrics: LiveMetricRead[]; cohortStatus: Record<Cohort, string> } | { ok: false; error: string }> => {
  try {
    const sdk = await loadFhenixSdk();
    if (!account || !sdk.loaded || !sdk.web || !sdk.adapters) {
      return { ok: false, error: "Encrypted aggregate updated; Fhenix SDK decrypt adapter unavailable." };
    }

    const client = await createConnectedCofheClient(sdk, provider, signer);
    const permit = await client.permits?.getOrCreateSelfPermit(getExpectedChainId(), account);
    if (permit && client.permits?.getHash && client.permits?.selectActivePermit) {
      client.permits.selectActivePermit(client.permits.getHash(permit), getExpectedChainId(), account);
    }

    const contract = new Contract(getContractAddress()!, contractAbi, signer);
    const handles = await readMetricHandles(contract);
    const decryptNumber = async (key: string, utype = EUINT32_UTYPE) => {
      const handle = handles[key];
      if (!handle?.startsWith("0x") || handle === ZERO_HANDLE) return undefined;
      const builder = client.decryptForView(handle, utype);
      builder.setChainId(getExpectedChainId());
      builder.setAccount(account);
      builder.withPermit();
      builder.set404RetryTimeout?.(16000);
      const value = await builder.execute();
      if (typeof value === "boolean") return value ? 1 : 0;
      return Number(value);
    };

    const cohortReads = await Promise.all(
      cohortIndex.map(async (_, index) => ({
        users: await decryptNumber(`users:${index}`),
        volume: await decryptNumber(`volume:${index}`),
        riskHigh: await decryptNumber(`riskHigh:${index}`),
        daoYes: await decryptNumber(`daoYes:${index}`),
        daoNo: await decryptNumber(`daoNo:${index}`)
      }))
    );
    const alert = await decryptNumber("alert:0", EBOOL_UTYPE);
    const anyVisible = cohortReads.some((read) => Object.values(read).some((value) => value !== undefined)) || alert !== undefined;
    if (!anyVisible) {
      return { ok: false, error: "Reveal transaction pending; CoFHE decrypt result not visible yet." };
    }

    const sum = (key: keyof (typeof cohortReads)[number]) =>
      cohortReads.reduce((total, read) => total + (read[key] ?? 0), 0);
    const users = sum("users");
    const volume = sum("volume");
    const risk = sum("riskHigh");
    const yes = sum("daoYes");
    const no = sum("daoNo");
    const daoPct = yes + no ? Math.round((yes / (yes + no)) * 100) : 0;
    const activeCohorts = cohortReads.filter((read) => (read.users ?? 0) > 0).length;
    const health = risk >= 8 ? "Red" : risk >= 3 ? "Amber" : "Green";

    return {
      ok: true,
      metrics: [
        revealedMetric("Encrypted submissions", String(users)),
        revealedMetric("Active cohorts", String(activeCohorts)),
        revealedMetric("Aggregate volume", String(volume)),
        revealedMetric("DAO pulse", `${daoPct}% positive`),
        revealedMetric("Risk alerts", `${risk} high-risk`),
        revealedMetric("Alert status", alert ? "Alert fired" : "No alert"),
        revealedMetric("Health score", health)
      ],
      cohortStatus: Object.fromEntries(
        cohortIndex.map((cohort, index) => [
          cohort,
          cohortReads[index].users !== undefined ? `${cohortReads[index].users} encrypted records revealed` : "Reveal pending"
        ])
      ) as Record<Cohort, string>
    };
  } catch (error) {
    return { ok: false, error: `Auto reveal failed: ${getErrorMessage(error)}` };
  }
};

const revealedMetric = (label: string, value: string): LiveMetricRead => ({ label, value, status: value === "Reveal pending" ? "reveal-required" : "revealed" });

const numberFromMetric = (metric?: LiveMetricRead) => {
  if (!metric) return 0;
  const value = Number.parseInt(metric.value, 10);
  return Number.isFinite(value) ? value : 0;
};

const cohortsFromRead = (live: LiveAnalyticsRead) =>
  cohortIndex.map((cohort) => ({
    cohort,
    users: live.cohortStatus[cohort] === "Aggregate revealed" ? numberFromMetric(live.metrics[0]) : 0,
    volume: live.cohortStatus[cohort] === "Aggregate revealed" ? numberFromMetric(live.metrics[2]) : 0,
    riskHigh: live.cohortStatus[cohort] === "Aggregate revealed" ? numberFromMetric(live.metrics[4]) : 0,
    yesVotes: 0,
    noVotes: 0
  }));

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "shortMessage" in error) return String((error as { shortMessage?: unknown }).shortMessage);
  return String(error);
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}
