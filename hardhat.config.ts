import { HardhatUserConfig, task } from "hardhat/config";

import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
dotenv.config();

const { ETHERSCAN_API_KEY } = process.env;
const {
  FORK_URL,
  ROPSTEN_URL,
  ROPSTEN_PRIV_KEY,
  KOVAN_URL,
  KOVAN_PRIV_KEY,
  RINKEBY_URL,
  RINKEBY_PRIV_KEY,
  GOERLI_URL,
  GOERLI_PRIV_KEY,
  MAINNET_URL,
  MAINNET_PRIV_KEY,
} = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.13",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
        // Uncomment this for coverage tests (otherwise "stack too deep" appears):
        // details: {
        //   yul: true,
        //   yulDetails: {
        //     stackAllocation: true,
        //   },
        // },
      },
    },
  },
  networks: {
    hardhat: {
      forking: FORK_URL
        ? {
            url: FORK_URL,
            blockNumber: 12927325,
          }
        : undefined,
    },
    mainnet: {
      chainId: 1,
      url: MAINNET_URL!,
      accounts: [MAINNET_PRIV_KEY!],
    },
    ropsten: {
      chainId: 3,
      url: ROPSTEN_URL!,
      accounts: [ROPSTEN_PRIV_KEY!],
    },
    rinkeby: {
      chainId: 4,
      url: RINKEBY_URL!,
      accounts: [RINKEBY_PRIV_KEY!],
    },
    goerli: {
      chainId: 5,
      url: GOERLI_URL!,
      accounts: [GOERLI_PRIV_KEY!],
    },
    kovan: {
      chainId: 42,
      url: KOVAN_URL!,
      accounts: [KOVAN_PRIV_KEY!],
    },
  },
  mocha: {
    timeout: 9999999999,
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
