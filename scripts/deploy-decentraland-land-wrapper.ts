import hre, { ethers } from "hardhat";
import { LandWrapper__factory, UniV3Wrapper__factory, LandWrapper } from "../typechain";
import * as dotenv from "dotenv";
import { loadAddressBook, saveAddressBook } from "./utils/address-book-manager";
import { confirmInput, handleInteractiveInput } from "./utils/handle-interactive-input";
import { handleEtherscanVerification } from "./utils/handle-etherscan-verification";
import { getCurrentGas } from "./utils/estimate-gas";
import { wait } from "./utils/wait";
import { estimateDeploymentGas } from "./utils/estimateDeploymentGas";

async function main() {
  console.log("\n\n\n\n\n\n\n");
  console.log("----------------------------------------");
  console.log("   DECENTRALAND LAND WRAPPER DEPLOYER   ");
  console.log("----------------------------------------\n");

  const {
    name,
    config: { chainId },
  } = hre.network;

  console.log(`Connected to ${name} (${chainId})`);

  const addressBook = loadAddressBook(chainId!);
  const addresses = addressBook[chainId!];
  dotenv.config({ path: `.env.${name}` });

  if (!addresses.decentralandLand) {
    console.log("Decentraland Land address not found in addressbook");
    process.exit();
  }
  const landAddress = addresses.decentralandLand;

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

  const [deployer] = await ethers.getSigners();

  if (!addresses.landWrapper) {
    console.log(`Using this address to deploy: ${await deployer.getAddress()}`);
    const deployerBalance = parseInt((await deployer.getBalance()).toString()) / 1e18;
    console.log(`\tBALANCE: ${deployerBalance.toFixed(4)} ETH`);

    await confirmInput();

    const landWrapperFactory = (await ethers.getContractFactory("LandWrapper")) as LandWrapper__factory;

    console.log("\nAbout to deploy Land Wrapper with the following parameters:");
    console.log(`\n\tLand NFT address: ${landAddress}\n`);
    await confirmInput("if above data is correct");

    const estimatedGas = await estimateDeploymentGas(LandWrapper__factory, deployer, [landAddress]);

    const currentGasPrice = await getCurrentGas(ethercan_api_key);
    console.log(`\nCurrent ETH Mainnet gas price is: ${currentGasPrice}`);
    const deploymentMaxFeePerGas = parseFloat((await handleInteractiveInput("maxFeePerGas")) as string);
    const deploymentMaxPriorityFee = parseFloat((await handleInteractiveInput("maxPriorityFee")) as string);

    const gasCosts = (deploymentMaxFeePerGas * estimatedGas) / 1e9;
    console.log(
      `\nDeploying LandWrapper contract (${estimatedGas} gas) with ${deploymentMaxFeePerGas.toFixed(10)} gwei gas price will cost: ${gasCosts.toFixed(
        4,
      )} ETH`,
    );

    if (gasCosts > deployerBalance) {
      console.log(`You don't have enough ether on Deployer address. Add ${(gasCosts - deployerBalance).toFixed(4)} more to proceed`);
    }

    await confirmInput(
      `deploying with ${deploymentMaxFeePerGas.toFixed(10)} gwei maxFeePerGas and ${deploymentMaxPriorityFee.toFixed(10)} gwei maxPriorityFee`,
    );

    console.log(`\nDeploying LandWrapper on ${name}...\n`);
    const landWrapper = await landWrapperFactory.deploy(landAddress, {
      maxFeePerGas: ethers.utils.parseUnits(deploymentMaxFeePerGas.toFixed(10), "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits(deploymentMaxPriorityFee.toFixed(10), "gwei"),
      gasLimit: estimatedGas + 10000,
    });
    console.log(`txHash: ${landWrapper.deployTransaction.hash}`);
    console.log(`expected address: ${landWrapper.address}`);
    await landWrapper.deployed();

    addresses["landWrapper"] = landWrapper.address;
    saveAddressBook(addressBook);
    console.log(`\n\nSuccessfully deployed!\n\n`);
    console.log("Waiting 15 seconds for Etherscan verification...");
    await wait(15);
  } else {
    console.log("Land Wrapper is already deployed on this network:\n", addresses.landWrapper);
    console.log(`\nPlease remove it from addressBook to deploy again`);
  }

  await handleEtherscanVerification(addresses.landWrapper, [landAddress]);
}

main();
