import hre, { ethers } from "hardhat";
import { EstateWrapper__factory, UniV3Wrapper__factory } from "../typechain";
import * as dotenv from "dotenv";
import { loadAddressBook, saveAddressBook } from "./utils/address-book-manager";
import { confirmInput, handleInteractiveInput } from "./utils/handle-interactive-input";
import { handleEtherscanVerification } from "./utils/handle-etherscan-verification";
import { getCurrentGas } from "./utils/estimate-gas";
import { wait } from "./utils/wait";
import { estimateDeploymentGas } from "./utils/estimateDeploymentGas";

async function main() {
  console.log("\n\n\n\n\n\n\n");
  console.log("------------------------------------------");
  console.log("   DECENTRALAND ESTATE WRAPPER DEPLOYER   ");
  console.log("------------------------------------------\n");

  const {
    name,
    config: { chainId },
  } = hre.network;

  console.log(`Connected to ${name} (${chainId})`);

  const addressBook = loadAddressBook(chainId!);
  const addresses = addressBook[chainId!];
  dotenv.config({ path: `.env.${name}` });

  if (!addresses.decentralandEstate) {
    console.log("Decentraland Estate address not found in addressbook");
    process.exit();
  }
  const estateAddress = addresses.decentralandEstate;

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

  if (!addresses.estateWrapper) {
    console.log(`Using this address to deploy: ${await deployer.getAddress()}`);
    const deployerBalance = parseInt((await deployer.getBalance()).toString()) / 1e18;
    console.log(`\tBALANCE: ${deployerBalance.toFixed(4)} ETH`);

    await confirmInput();

    const estateWrapperFactory = (await ethers.getContractFactory("EstateWrapper")) as EstateWrapper__factory;

    console.log("\nAbout to deploy Estate Wrapper with the following parameters:");
    console.log(`\n\tEstate NFT address: ${estateAddress}\n`);
    await confirmInput("if above data is correct");

    const estimatedGas = await estimateDeploymentGas(EstateWrapper__factory, deployer, [estateAddress]);

    const currentGasPrice = await getCurrentGas(ethercan_api_key);
    console.log(`\nCurrent ETH Mainnet gas price is: ${currentGasPrice}`);
    const deploymentMaxFeePerGas = parseFloat((await handleInteractiveInput("maxFeePerGas")) as string);
    const deploymentMaxPriorityFee = parseFloat((await handleInteractiveInput("maxPriorityFee")) as string);

    const gasCosts = (deploymentMaxFeePerGas * estimatedGas) / 1e9;
    console.log(
      `\nDeploying EstateWrapper contract (${estimatedGas} gas) with ${deploymentMaxFeePerGas.toFixed(
        10,
      )} gwei gas price will cost: ${gasCosts.toFixed(4)} ETH`,
    );

    if (gasCosts > deployerBalance) {
      console.log(`You don't have enough ether on Deployer address. Add ${(gasCosts - deployerBalance).toFixed(4)} more to proceed`);
    }

    await confirmInput(
      `deploying with ${deploymentMaxFeePerGas.toFixed(10)} gwei maxFeePerGas and ${deploymentMaxPriorityFee.toFixed(10)} gwei maxPriorityFee`,
    );

    console.log(`\nDeploying EstateWrapper on ${name}...\n`);
    const estateWrapper = await estateWrapperFactory.deploy(estateAddress, {
      maxFeePerGas: ethers.utils.parseUnits(deploymentMaxFeePerGas.toFixed(10), "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits(deploymentMaxPriorityFee.toFixed(10), "gwei"),
      gasLimit: estimatedGas + 10000,
    });
    console.log(`txHash: ${estateWrapper.deployTransaction.hash}`);
    console.log(`expected address: ${estateWrapper.address}`);
    await estateWrapper.deployed();

    addresses["estateWrapper"] = estateWrapper.address;
    saveAddressBook(addressBook);
    console.log(`\n\nSuccessfully deployed!\n\n`);
    console.log("Waiting 15 seconds for Etherscan verification...");
    await wait(15);
  } else {
    console.log("Estate Wrapper is already deployed on this network:\n", addresses.estateWrapper);
    console.log(`\nPlease remove it from addressBook to deploy again`);
  }

  await handleEtherscanVerification(addresses.estateWrapper, [estateAddress]);
}

main();
