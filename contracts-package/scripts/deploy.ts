const { ethers, network } = require("hardhat");

const explorers: Record<string, string> = {
  sepolia: "https://sepolia.etherscan.io",
  arbitrumSepolia: "https://sepolia.arbiscan.io",
  baseSepolia: "https://sepolia.basescan.org"
};

async function main() {
  const factory = await ethers.getContractFactory("CipherPulseAnalytics");
  const contract = await factory.deploy();
  const deploymentTx = contract.deploymentTransaction();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = deploymentTx?.hash ?? "unavailable";
  const explorer = explorers[network.name];

  console.log(`CipherPulseAnalytics deployed to ${address} on ${network.name}`);
  console.log(`Deployment tx: ${txHash}`);
  if (explorer && txHash !== "unavailable") {
    console.log(`Explorer: ${explorer}/tx/${txHash}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
