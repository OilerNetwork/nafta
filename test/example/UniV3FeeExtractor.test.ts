import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { BigNumber, Contract, utils } from "ethers";
import hre, { ethers } from "hardhat";
import { Nafta, UniV3Wrapper, MockWETH } from "../../typechain";
import { solidity } from "ethereum-waffle";
import { createNaftaPool, createUniV3Flashloan } from "../utils";
import { loadAddressBook } from "../../scripts/utils/address-book-manager";

chai.use(solidity);

// For this test to work: put a FORK_URL in your .env with a  Mainnet infura/alchemy url.

describe("Fee Extractor", function () {
  let borrower: SignerWithAddress;
  let lender: SignerWithAddress;
  let uniV3Wrapper: UniV3Wrapper;
  let mockWeth: MockWETH;
  let addresses: any;

  this.beforeEach(async () => {
    // use mainnet chain id
    const addressBook = loadAddressBook(1);
    addresses = addressBook[1];

    // impersonating an account that already has uniswap v3 nft
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.flashLender],
    });

    lender = await ethers.getSigner(addresses.flashLender);

    // overriding the impersonated accounts balance to 10eth
    await hre.network.provider.send("hardhat_setBalance", [addresses.flashLender, ethers.utils.parseEther("10.0").toHexString()]);

    [borrower] = await ethers.getSigners();

    mockWeth = (await (await ethers.getContractFactory("MockWETH")).deploy()) as MockWETH;
    await mockWeth.deployed();
  });

  this.afterEach(async () => {
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.FORK_URL,
            blockNumber: 12927325,
          },
        },
      ],
    });
  });

  it("should extract fees from uniswap", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    //Get the uniswap lp nft
    const uniLp = await hre.ethers.getContractAt("INonfungiblePositionManager", addresses.nonfungiblePositionManager);

    // deploy the wrapper contract with the uniswap lp address
    uniV3Wrapper = await (await ethers.getContractFactory("UniV3Wrapper")).connect(lender).deploy(uniLp.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await uniLp.connect(lender).approve(uniV3Wrapper.address, 83435);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await uniV3Wrapper.connect(lender).wrap(83435);

    // Approving nft before lending to Nafta Pool
    tx = await uniV3Wrapper.connect(lender).approve(nafta.address, 83435);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(uniV3Wrapper.address, 83435, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(uniV3Wrapper.address, 83435, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    //checking balance of borrower before and after flashloan
    const usdc = await ethers.getContractAt("IERC20", addresses.USDC);
    const initialBalance = await usdc.balanceOf(borrower.address);
    console.log(`Balance before: ${ethers.utils.formatUnits(initialBalance, 6)} USDC`);

    await nafta.connect(borrower).flashloan(uniV3Wrapper.address, 83435, 0, uniV3Wrapper.address, []);

    const finalBalance = await usdc.balanceOf(borrower.address);
    console.log(`Balance after: ${ethers.utils.formatUnits(finalBalance, 6)} USDC`);

    expect(finalBalance).to.be.gt(initialBalance);
  });

  it("wrapper should revert if NFT was not approved", async () => {
    //Get the uniswap lp nft
    const uniLp = await hre.ethers.getContractAt("INonfungiblePositionManager", addresses.nonfungiblePositionManager);

    // deploy the wrapper contract with the uniswap lp address
    uniV3Wrapper = await (await ethers.getContractFactory("UniV3Wrapper")).connect(lender).deploy(uniLp.address);

    await expect(uniV3Wrapper.connect(lender).wrap(83435)).to.revertedWith("ERC721: transfer caller is not owner nor approved");
  });

  it("should be able to unwrap successfully", async () => {
    //Get the uniswap lp nft
    const uniLp = await hre.ethers.getContractAt("INonfungiblePositionManager", addresses.nonfungiblePositionManager);

    // deploy the wrapper contract with the uniswap lp address
    uniV3Wrapper = await (await ethers.getContractFactory("UniV3Wrapper")).connect(lender).deploy(uniLp.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await uniLp.connect(lender).approve(uniV3Wrapper.address, 83435);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await uniV3Wrapper.connect(lender).wrap(83435);
    expect(await uniLp.ownerOf(83435)).to.equal(uniV3Wrapper.address);

    await uniV3Wrapper.connect(lender).unwrap(83435);
    expect(await uniLp.ownerOf(83435)).to.equal(lender.address);
  });

  it("should revert if caller is not owner attempting to unwrap", async () => {
    //Get the uniswap lp nft
    const uniLp = await hre.ethers.getContractAt("INonfungiblePositionManager", addresses.nonfungiblePositionManager);

    // deploy the wrapper contract with the uniswap lp address
    uniV3Wrapper = await (await ethers.getContractFactory("UniV3Wrapper")).connect(lender).deploy(uniLp.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await uniLp.connect(lender).approve(uniV3Wrapper.address, 83435);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await uniV3Wrapper.connect(lender).wrap(83435);
    expect(await uniLp.ownerOf(83435)).to.equal(uniV3Wrapper.address);

    await expect(uniV3Wrapper.connect(borrower).unwrap(83435)).to.revertedWith("Only owner can unwrap NFT");
  });

  it("should revert if called is not owner attempting to extract fees", async () => {
    //Get the uniswap lp nft
    const uniLp = await hre.ethers.getContractAt("INonfungiblePositionManager", addresses.nonfungiblePositionManager);

    // deploy the wrapper contract with the uniswap lp address
    uniV3Wrapper = await (await ethers.getContractFactory("UniV3Wrapper")).connect(lender).deploy(uniLp.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await uniLp.connect(lender).approve(uniV3Wrapper.address, 83435);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await uniV3Wrapper.connect(lender).wrap(83435);
    expect(await uniLp.ownerOf(83435)).to.equal(uniV3Wrapper.address);

    await expect(uniV3Wrapper.connect(borrower).extractUniswapFees(83435, borrower.address)).to.revertedWith(
      "Only holder of wrapper can extract fees",
    );
  });

  it("should be able to wrap and lend to nafta in one transaction", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    //Get the uniswap lp nft
    const uniLp = await hre.ethers.getContractAt("INonfungiblePositionManager", addresses.nonfungiblePositionManager);

    // deploy the wrapper contract with the uniswap lp address
    uniV3Wrapper = await (await ethers.getContractFactory("UniV3Wrapper")).connect(lender).deploy(uniLp.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await uniLp.connect(lender).approve(uniV3Wrapper.address, 83435);
    await tx.wait();

    const initialBalance = await nafta.balanceOf(lender.address);
    await uniV3Wrapper.connect(lender).wrapAndAddToNafta(83435, nafta.address, 0, 20 * 1e9, 100);
    const finalBalance = await nafta.balanceOf(lender.address);

    expect(finalBalance).to.be.gt(initialBalance);
  });

  it("should be able to unwrap and remove from nafta in one transaction", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    //Get the uniswap lp nft
    const uniLp = await hre.ethers.getContractAt("INonfungiblePositionManager", addresses.nonfungiblePositionManager);

    // deploy the wrapper contract with the uniswap lp address
    uniV3Wrapper = await (await ethers.getContractFactory("UniV3Wrapper")).connect(lender).deploy(uniLp.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await uniLp.connect(lender).approve(uniV3Wrapper.address, 83435);
    await tx.wait();

    await uniV3Wrapper.connect(lender).wrapAndAddToNafta(83435, nafta.address, 0, 20 * 1e9, 100);
    const nftId = await nafta.lenderNFTCount();

    tx = await nafta.connect(lender).approve(uniV3Wrapper.address, nftId);
    await tx.wait();

    await uniV3Wrapper.connect(lender).unwrapAndRemoveFromNafta(nafta.address, 83435, nftId);

    expect(await uniLp.ownerOf(83435)).to.equal(lender.address);
  });

  it("should revert if not owner attempting to unwrap and remove from pool", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    //Get the uniswap lp nft
    const uniLp = await hre.ethers.getContractAt("INonfungiblePositionManager", addresses.nonfungiblePositionManager);

    // deploy the wrapper contract with the uniswap lp address
    uniV3Wrapper = await (await ethers.getContractFactory("UniV3Wrapper")).connect(lender).deploy(uniLp.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await uniLp.connect(lender).approve(uniV3Wrapper.address, 83435);
    await tx.wait();

    await uniV3Wrapper.connect(lender).wrapAndAddToNafta(83435, nafta.address, 0, 20 * 1e9, 100);
    const nftId = await nafta.lenderNFTCount();

    tx = await nafta.connect(lender).approve(uniV3Wrapper.address, nftId);
    await tx.wait();

    await expect(uniV3Wrapper.connect(borrower).unwrapAndRemoveFromNafta(nafta.address, 83435, nftId)).to.revertedWith(
      "Only owner can unwrap NFT",
    );
  });
});
