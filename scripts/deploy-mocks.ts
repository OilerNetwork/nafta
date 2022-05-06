import hre, { ethers } from "hardhat";
import { EstateWrapper__factory, MockEstate__factory, MockLand__factory, UniV3Wrapper__factory } from "../typechain";
import * as dotenv from "dotenv";
import { loadAddressBook, saveAddressBook } from "./utils/address-book-manager";
import { confirmInput, handleInteractiveInput } from "./utils/handle-interactive-input";
import { handleEtherscanVerification } from "./utils/handle-etherscan-verification";
import { getCurrentGas } from "./utils/estimate-gas";
import { wait } from "./utils/wait";

async function main() {
  console.log("\n\n\n\n\n\n\n");
  console.log("--------------------");
  console.log("   MOCKS DEPLOYER   ");
  console.log("--------------------\n");

  const {
    name,
    config: { chainId },
  } = hre.network;

  console.log(`Connected to ${name} (${chainId})`);

  const addressBook = loadAddressBook(chainId!);
  const addresses = addressBook[chainId!];
  dotenv.config({ path: `.env.${name}` });

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

  if (!addresses.mockLand) {
    const mockLandFactory = (await ethers.getContractFactory("MockLand")) as MockLand__factory;

    console.log(`\nDeploying EstateWrapper on ${name}...\n`);
    const mockLand = await mockLandFactory.deploy("Decentraland", "LAND");
    console.log(`txHash: ${mockLand.deployTransaction.hash}`);
    console.log(`expected address: ${mockLand.address}`);
    await mockLand.deployed();

    addresses["mockLand"] = mockLand.address;
    saveAddressBook(addressBook);
    console.log(`\n\nSuccessfully deployed!\n\n`);
  } else {
    console.log("MockLAND is already deployed on this network:\n", addresses.mockLand);
    console.log(`\nPlease remove it from addressBook to deploy again`);
  }

  if (!addresses.mockEstate) {
    const mockEstateFactory = (await ethers.getContractFactory("MockEstate")) as MockEstate__factory;

    console.log(`\nDeploying EstateWrapper on ${name}...\n`);
    const mockEstate = await mockEstateFactory.deploy("Estate", "EST");
    console.log(`txHash: ${mockEstate.deployTransaction.hash}`);
    console.log(`expected address: ${mockEstate.address}`);
    await mockEstate.deployed();

    addresses["mockEstate"] = mockEstate.address;
    saveAddressBook(addressBook);
    console.log(`\n\nSuccessfully deployed!\n\n`);
  } else {
    console.log("MockEST is already deployed on this network:\n", addresses.mockEstate);
    console.log(`\nPlease remove it from addressBook to deploy again`);
  }

  await wait(15);
  try {
    await handleEtherscanVerification(addresses.mockLand, ["Decentraland", "LAND"]);
  } catch (e) {
    console.log(e);
  }
  try {
    await handleEtherscanVerification(addresses.mockEstate, ["Estate", "EST"]);
  } catch (e) {
    console.log(e);
  }
}

main();
