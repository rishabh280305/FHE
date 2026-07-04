import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

const privateKey = process.env.PRIVATE_KEY;
const accounts = privateKey ? [privateKey] : [];

const config: HardhatUserConfig = {
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  solidity: {
    version: "0.8.25",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "",
      chainId: 421614,
      accounts
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "",
      chainId: 84532,
      accounts
    },
    sepolia: {
      url:
        process.env.ETHEREUM_SEPOLIA_RPC_URL ||
        process.env.SEPOLIA_RPC_URL ||
        process.env.NEXT_PUBLIC_RPC_URL ||
        "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts
    }
  }
};

export default config;
