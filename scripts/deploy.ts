import { ethers, network } from "hardhat";

async function main() {
  const factory = await ethers.getContractFactory("CipherPulseAnalytics");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`CipherPulseAnalytics deployed to ${address} on ${network.name}`);
  console.log("Set NEXT_PUBLIC_CONTRACT_ADDRESS to this address for Testnet Mode.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
