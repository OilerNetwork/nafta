import hre, { ethers } from "hardhat";
import { UniV3Wrapper__factory } from "../typechain";
import * as dotenv from "dotenv";
import { loadAddressBook, saveAddressBook } from "./utils/address-book-manager";
import { confirmInput, handleInteractiveInput } from "./utils/handle-interactive-input";
import { handleEtherscanVerification } from "./utils/handle-etherscan-verification";
import { getCurrentGas } from "./utils/estimate-gas";
import { estimateDeploymentGas } from "./utils/estimateDeploymentGas";

async function main() {
  console.log("\n\n\n\n\n\n\n");
  console.log("-----------------------------");
  console.log("   UNIV3 WRAPPERS DEPLOYER   ");
  console.log("-----------------------------\n");

  const {
    name,
    config: { chainId },
  } = hre.network;

  console.log(`Connected to ${name} (${chainId})`);

  const addressBook = loadAddressBook(chainId!);
  const addresses = addressBook[chainId!];
  dotenv.config({ path: `.env.${name}` });

  if (!addresses.nonfungiblePositionManager) {
    console.log("nonfungiblePositionManager address not found in addressbook");
    process.exit();
  }
  const nonfungiblePositionManager = addresses.nonfungiblePositionManager;

  if (!process.env.ETHERSCAN_API_KEY) {
    console.log("ETHERSCAN_API_KEY not found in .env");
    process.exit();
  }
  const ethercan_api_key = process.env.ETHERSCAN_API_KEY;

  if (Object.keys(addresses).length > 0) {
    console.log(`Addressbook contains following addresses:`);
    console.log(addresses);
  } else {
    console.log(`Addressbook is empty`);
  }

  if (!addresses.uniswapWrapper) {
    const [deployer] = await ethers.getSigners();
    console.log(`Using this address to deploy: ${await deployer.getAddress()}`);
    const deployerBalance = parseInt((await deployer.getBalance()).toString()) / 1e18;
    console.log(`\tBALANCE: ${deployerBalance.toFixed(4)} ETH`);

    await confirmInput();

    const wrapperFactory = (await ethers.getContractFactory("UniV3Wrapper")) as UniV3Wrapper__factory;

    console.log("\nAbout to deploy Uniswap Wrapper with the following parameters:");
    console.log(`\n\tUniswap LP NFT address: ${nonfungiblePositionManager}\n`);
    await confirmInput("if above data is correct");

    const estimatedGas = await estimateDeploymentGas(UniV3Wrapper__factory, deployer, [nonfungiblePositionManager]);

    const currentGasPrice = await getCurrentGas(ethercan_api_key);
    console.log(`\nCurrent ETH Mainnet gas price is: ${currentGasPrice}`);
    const deploymentMaxFeePerGas = parseFloat((await handleInteractiveInput("maxFeePerGas")) as string);
    const deploymentMaxPriorityFee = parseFloat((await handleInteractiveInput("maxPriorityFee")) as string);

    const gasCosts = (deploymentMaxFeePerGas * estimatedGas) / 1e9;
    console.log(
      `\nDeploying UniswapWrapper contract (${estimatedGas} gas) with ${deploymentMaxFeePerGas.toFixed(
        10,
      )} gwei gas price will cost: ${gasCosts.toFixed(4)} ETH`,
    );

    if (gasCosts > deployerBalance) {
      console.log(`You don't have enough ether on Deployer address. Add ${(gasCosts - deployerBalance).toFixed(4)} more to proceed`);
    }

    await confirmInput(
      `deploying with ${deploymentMaxFeePerGas.toFixed(10)} gwei maxFeePerGas and ${deploymentMaxPriorityFee.toFixed(10)} gwei maxPriorityFee`,
    );

    console.log(`\nDeploying Uniswap Wrapper on ${name}...\n`);
    const wrapper = await wrapperFactory.deploy(nonfungiblePositionManager, {
      maxFeePerGas: ethers.utils.parseUnits(deploymentMaxFeePerGas.toFixed(10), "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits(deploymentMaxPriorityFee.toFixed(10), "gwei"),
      gasLimit: estimatedGas + 10000,
    });
    console.log(`txHash: ${wrapper.deployTransaction.hash}`);
    console.log(`expected address: ${wrapper.address}`);
    await wrapper.deployed();

    addresses["uniswapWrapper"] = wrapper.address;
    saveAddressBook(addressBook);
    console.log(`\n\nSuccessfully deployed!\n\n`);
  } else {
    console.log("\nUniswap Wrapper is already deployed on this network:\n", addresses.uniswapWrapper);
    console.log(`\nPlease remove it from addressBook to deploy again`);
  }

  await handleEtherscanVerification(addresses.uniswapWrapper, [nonfungiblePositionManager]);
}

main();
