import hre, { ethers } from "hardhat";
import { Nafta__factory, MockWETH__factory } from "../typechain";
import { Nafta, MockWETH } from "../typechain";
import * as dotenv from "dotenv";
import { loadAddressBook, saveAddressBook } from "./utils/address-book-manager";
import { confirmInput, handleInteractiveInput } from "./utils/handle-interactive-input";
import { handleEtherscanVerification } from "./utils/handle-etherscan-verification";
import { getCurrentGas } from "./utils/estimate-gas";
import { utils } from "ethers";
import { wait } from "./utils/wait";
import { estimateDeploymentGas } from "./utils/estimateDeploymentGas";

async function deployMockWETH(): Promise<MockWETH> {
  let mockWETH: MockWETH;
  mockWETH = (await (await ethers.getContractFactory("MockWETH")).deploy()) as MockWETH;
  await mockWETH.deployed();
  return mockWETH;
}

async function mintMockWETH(mockWETH: MockWETH, receiver: string) {
  let tx = await mockWETH.setPaused(false);
  await tx.wait();

  tx = await mockWETH.mint(receiver, utils.parseEther("10000000"));
  await tx.wait();
}

async function main() {
  console.log("\n\n\n\n\n\n\n");
  console.log("--------------------");
  console.log("   NAFTA DEPLOYER   ");
  console.log("--------------------\n");

  const {
    name,
    config: { chainId },
  } = hre.network;

  let mockWETH: MockWETH;

  console.log(`Connected to ${name} (${chainId})`);

  const addressBook = loadAddressBook(chainId!);
  const addresses = addressBook[chainId!];
  dotenv.config({ path: `.env.${name}` });

  if (!process.env.OWNER) {
    console.log("No OWNER found in .env - setting the owner to deployer");
  }

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
  console.log(`Using this address to deploy: ${await deployer.getAddress()}`);
  const deployerBalance = parseInt((await deployer.getBalance()).toString()) / 1e18;
  console.log(`\tBALANCE: ${deployerBalance.toFixed(4)} ETH`);

  await confirmInput();

  if (!addresses.WETH9) {
    console.log("\nThere's no WETH9 address in the addressbook. Will deploy a mock...");
    await confirmInput("mock deployment");
    console.log(`\nDeploying MockWETH9...`);
    mockWETH = await deployMockWETH();
    console.log(`Deployed MockWETH9 at ${mockWETH.address}\n`);
    addresses["WETH9"] = mockWETH.address;
    saveAddressBook(addressBook);
    console.log("Minting MockWETH9 tokens for deployer...\n");
    await mintMockWETH(mockWETH, await deployer.getAddress());
  }

  let ownerAddress;
  ownerAddress = process.env.OWNER ? process.env.OWNER : await deployer.getAddress();

  if (!addresses["nafta"]) {
    const naftaFactory = (await ethers.getContractFactory("Nafta")) as Nafta__factory;

    const WETH9Address = addresses.WETH9;
    console.log("\nAbout to deploy NAFTA pool with the following parameters:");
    console.log(`\n\tOwner: ${ownerAddress}`);
    console.log(`\n\tWETH9: ${WETH9Address}\n`);
    await confirmInput("if above data is correct");

    const estimatedGas = await estimateDeploymentGas(Nafta__factory, deployer, [ownerAddress, WETH9Address]);

    const currentGasPrice = await getCurrentGas(ethercan_api_key);
    console.log(`\nCurrent ETH Mainnet gas price is: ${currentGasPrice}`);
    const deploymentMaxFeePerGas = parseFloat((await handleInteractiveInput("maxFeePerGas")) as string);
    const deploymentMaxPriorityFee = parseFloat((await handleInteractiveInput("maxPriorityFee")) as string);

    const gasCosts = (deploymentMaxFeePerGas * estimatedGas) / 1e9;
    console.log(
      `\nDeploying NAFTA contract (${estimatedGas} gas) with ${deploymentMaxFeePerGas.toFixed(10)} gwei gas price will cost: ${gasCosts.toFixed(
        4,
      )} ETH`,
    );

    if (gasCosts > deployerBalance) {
      console.log(`You don't have enough ether on Deployer address. Add ${(gasCosts - deployerBalance).toFixed(4)} more to proceed`);
    }

    await confirmInput(
      `deploying with ${deploymentMaxFeePerGas.toFixed(10)} gwei maxFeePerGas and ${deploymentMaxPriorityFee.toFixed(10)} gwei maxPriorityFee`,
    );

    console.log(`\nDeploying NAFTA Pool on ${name}...\n`);
    const nafta = await naftaFactory.deploy(ownerAddress, WETH9Address, {
      maxFeePerGas: utils.parseUnits(deploymentMaxFeePerGas.toFixed(10), "gwei"),
      maxPriorityFeePerGas: utils.parseUnits(deploymentMaxPriorityFee.toFixed(10), "gwei"),
      gasLimit: estimatedGas + 10000,
    });
    console.log(`txHash: ${nafta.deployTransaction.hash}`);
    console.log(`expected address: ${nafta.address}`);
    await nafta.deployed();

    addresses["nafta"] = nafta.address;
    saveAddressBook(addressBook);
    console.log(`\n\nSuccessfully deployed!\n\n`);
  } else {
    console.log("\nNafta is already deployed on this network:\n", addresses.nafta);
    console.log(`\nPlease remove it from addressBook to deploy again`);
  }

  console.log("Waiting 15 seconds for Etherscan verification...");
  await wait(15);
  await handleEtherscanVerification(addresses.nafta, [ownerAddress, addresses.WETH9]);
}

main();
