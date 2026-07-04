const { createCofheClient, createCofheConfig } = require("@cofhe/sdk/node");
const { Ethers6Adapter } = require("@cofhe/sdk/adapters");
const { sepolia } = require("@cofhe/sdk/chains");
const { Contract, JsonRpcProvider, Wallet } = require("ethers");

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x8C9244E7f745328476639152E0bbFd41d46797e9";
const RPC_URL = process.env.ETHEREUM_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const CHAIN_ID = 11155111;
const ALERT_THRESHOLD = 75;
const EUINT32_UTYPE = 4;
const EBOOL_UTYPE = 0;

const encryptedInputTuple = "tuple(uint256 ctHash,uint8 securityZone,uint8 utype,bytes signature)";
const abi = [
  `function submitFullSignal(${encryptedInputTuple} encryptedActivity, ${encryptedInputTuple} encryptedRisk, ${encryptedInputTuple} encryptedVoteOrSentiment, ${encryptedInputTuple} encryptedKpi, uint8 cohort, uint32 publicAlertThreshold) external`
];

const cohorts = ["Contributors", "Delegates", "Whales", "New Users"] as const;
type Cohort = (typeof cohorts)[number];

type SeedSignal = {
  cohort: Cohort;
  activityAmount: number;
  riskScore: number;
  daoVote: "yes" | "no";
  kpiValue: number;
};

function seedSignalAt(index: number): SeedSignal {
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
}

function toSolidityInput(input: { ctHash: bigint | string | number; securityZone: number; utype: number; signature: string }) {
  return [BigInt(input.ctHash), Number(input.securityZone), Number(input.utype), input.signature] as const;
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY env var is required for live seeding.");
  }

  const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
  const contract = new Contract(CONTRACT_ADDRESS, abi, wallet);
  const { publicClient, walletClient } = await Ethers6Adapter(provider, wallet);
  const cofhe = createCofheClient(createCofheConfig({ supportedChains: [sepolia] }));
  await cofhe.connect(publicClient, walletClient);

  const hashes: string[] = [];
  for (let index = 0; index < 30; index += 1) {
    const signal = seedSignalAt(index);
    const builder = cofhe.encryptInputs([
      { data: BigInt(signal.activityAmount), securityZone: 0, utype: EUINT32_UTYPE },
      { data: BigInt(signal.riskScore), securityZone: 0, utype: EUINT32_UTYPE },
      { data: signal.daoVote === "yes", securityZone: 0, utype: EBOOL_UTYPE },
      { data: BigInt(signal.kpiValue), securityZone: 0, utype: EUINT32_UTYPE }
    ]);
    builder.setAccount(wallet.address);
    builder.setChainId(CHAIN_ID);
    builder.setSecurityZone(0);
    builder.setUseWorker?.(false);
    const [activity, risk, vote, kpi] = await builder.execute();
    const tx = await contract.submitFullSignal(
      toSolidityInput(activity),
      toSolidityInput(risk),
      toSolidityInput(vote),
      toSolidityInput(kpi),
      cohorts.indexOf(signal.cohort),
      ALERT_THRESHOLD
    );
    const receipt = await tx.wait();
    hashes.push(receipt?.hash || tx.hash);
    console.log(`confirmed ${index + 1}/30 ${receipt?.hash || tx.hash}`);
  }

  console.log(`seeded=30`);
  console.log(`latest=${hashes[hashes.length - 1]}`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
