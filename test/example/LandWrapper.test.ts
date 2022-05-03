import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers } from "hardhat";
import { Nafta, LandWrapper, MockWETH } from "../../typechain";
import { solidity } from "ethereum-waffle";
import { createNaftaPool } from "../utils";
import { loadAddressBook } from "../../scripts/utils/address-book-manager";

chai.use(solidity);

// For this test to work: put a FORK_URL in your .env with a  Mainnet infura/alchemy url.

describe("DecentralandLandRent", function () {
  let borrower: SignerWithAddress;
  let lender: SignerWithAddress;
  let landWrapper: LandWrapper;
  let mockWeth: MockWETH;
  let addresses: any;

  const landId = "115792089237316195423570985008687907837957278154198333183605726673483560124411";
  const estateId = "4161";

  this.beforeEach(async () => {
    // use mainnet chain id
    const addressBook = loadAddressBook(1);
    addresses = addressBook[1];

    // impersonating an account that already has LAND nft
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.decentralandLandOwner],
    });

    lender = await ethers.getSigner(addresses.decentralandLandOwner);

    // overriding the impersonated accounts balance to 10eth
    await hre.network.provider.send("hardhat_setBalance", [addresses.decentralandLandOwner, ethers.utils.parseEther("10.0").toHexString()]);

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
            blockNumber: 14698544,
          },
        },
      ],
    });
  });

  it("should change updateOperator", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);
    const landRegistry = await ethers.getContractAt("ILANDRegistry", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await landWrapper.connect(lender).wrap(landId);

    // Approving nft before lending to Nafta Pool
    tx = await landWrapper.connect(lender).approve(nafta.address, landId);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(landWrapper.address, landId, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(landWrapper.address, landId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    // const usdc = await ethers.getContractAt("IERC20", addresses.USDC);
    // const initialBalance = await usdc.balanceOf(borrower.address);
    const operatorBefore = await landRegistry.updateOperator(landId);
    // console.log("Operator before:", operatorBefore);
    expect(operatorBefore).to.be.eq(ethers.constants.AddressZero);

    await nafta.connect(borrower).flashloan(landWrapper.address, landId, 0, landWrapper.address, []);

    const operatorAfter = await landRegistry.updateOperator(landId);
    // console.log("Operator after:", operatorAfter);
    expect(operatorAfter).to.be.eq(await borrower.getAddress());
  });

  it("should change updateOperator with calldata", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);
    const landRegistry = await ethers.getContractAt("ILANDRegistry", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await landWrapper.connect(lender).wrap(landId);

    // Approving nft before lending to Nafta Pool
    tx = await landWrapper.connect(lender).approve(nafta.address, landId);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(landWrapper.address, landId, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(landWrapper.address, landId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    // const usdc = await ethers.getContractAt("IERC20", addresses.USDC);
    // const initialBalance = await usdc.balanceOf(borrower.address);
    const operatorBefore = await landRegistry.updateOperator(landId);
    // console.log("Operator before:", operatorBefore);
    expect(operatorBefore).to.be.eq(ethers.constants.AddressZero);

    const randomAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    await nafta.connect(borrower).flashloan(landWrapper.address, landId, 0, landWrapper.address, randomAddress);

    const operatorAfter = await landRegistry.updateOperator(landId);
    // console.log("Operator after:", operatorAfter);
    expect(operatorAfter).to.be.eq(randomAddress);
  });

  it("should change updateOperator back to zero after upwrap & remove from nafta", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);
    const landRegistry = await ethers.getContractAt("ILANDRegistry", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await landWrapper.connect(lender).wrap(landId);

    // Approving nft before lending to Nafta Pool
    tx = await landWrapper.connect(lender).approve(nafta.address, landId);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(landWrapper.address, landId, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(landWrapper.address, landId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    // const usdc = await ethers.getContractAt("IERC20", addresses.USDC);
    // const initialBalance = await usdc.balanceOf(borrower.address);
    const operatorBefore = await landRegistry.updateOperator(landId);
    // console.log("Operator before:", operatorBefore);
    expect(operatorBefore).to.be.eq(ethers.constants.AddressZero);

    const randomAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    await nafta.connect(borrower).flashloan(landWrapper.address, landId, 0, landWrapper.address, randomAddress);

    const operatorAfter = await landRegistry.updateOperator(landId);
    // console.log("Operator after:", operatorAfter);
    expect(operatorAfter).to.be.eq(randomAddress);

    // Wraps the nft, and lender is minted a wrapped nft
    await nafta.connect(lender).approve(landWrapper.address, lenderNFTCount.add(1));
    await landWrapper.connect(lender).unwrapAndRemoveFromNafta(nafta.address, landId, lenderNFTCount.add(1));

    const operatorAfterRemoval = await landRegistry.updateOperator(landId);
    // console.log("Operator after removal:", operatorAfterRemoval);
    expect(operatorAfterRemoval).to.be.eq(ethers.constants.AddressZero);
  });

  it("wrapper should revert if LAND NFT was not approved", async () => {
    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    await expect(landWrapper.connect(lender).wrap(landId)).to.reverted;
  });

  it("should be able to unwrap successfully", async () => {
    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    // Wraps the LAND nft, and lender is minted a wrapped nft
    await landWrapper.connect(lender).wrap(landId);
    expect(await land.ownerOf(landId)).to.equal(landWrapper.address);

    // Unwraps the LAND nft
    await landWrapper.connect(lender).unwrap(landId);
    expect(await land.ownerOf(landId)).to.equal(lender.address);
  });

  it("should revert if caller who is not owner attempting to unwrap", async () => {
    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await landWrapper.connect(lender).wrap(landId);
    expect(await land.ownerOf(landId)).to.equal(landWrapper.address);

    await expect(landWrapper.connect(borrower).unwrap(landId)).to.revertedWith("Only owner can unwrap NFT");
  });

  it("should revert if called is not owner attempting to change updateOperator", async () => {
    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await landWrapper.connect(lender).wrap(landId);
    expect(await land.ownerOf(landId)).to.equal(landWrapper.address);

    await expect(landWrapper.connect(borrower).changeUpdateOperator(landId, borrower.address)).to.revertedWith(
      "Only holder of wrapped LAND can change UpdateOperator",
    );
  });

  it("should be able to wrap and lend to nafta in one transaction", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    const initialBalance = await nafta.balanceOf(lender.address);
    await landWrapper.connect(lender).wrapAndAddToNafta(landId, nafta.address, 0, 20 * 1e9, 100);
    const finalBalance = await nafta.balanceOf(lender.address);

    expect(finalBalance).to.be.gt(initialBalance);
  });

  it("should be able to unwrap and remove from nafta in one transaction", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    await landWrapper.connect(lender).wrapAndAddToNafta(landId, nafta.address, 0, 20 * 1e9, 100);
    const nftId = await nafta.lenderNFTCount();

    tx = await nafta.connect(lender).approve(landWrapper.address, nftId);
    await tx.wait();

    await landWrapper.connect(lender).unwrapAndRemoveFromNafta(nafta.address, landId, nftId);

    expect(await land.ownerOf(landId)).to.equal(lender.address);
  });

  it("should revert if not owner attempting to unwrap and remove from pool", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const land = await ethers.getContractAt("IERC721", addresses.decentralandLand);

    // deploy the wrapper contract with the proper Land addresses
    landWrapper = await (await ethers.getContractFactory("LandWrapper")).connect(lender).deploy(land.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await land.connect(lender).approve(landWrapper.address, landId);
    await tx.wait();

    await landWrapper.connect(lender).wrapAndAddToNafta(landId, nafta.address, 0, 20 * 1e9, 100);
    const nftId = await nafta.lenderNFTCount();

    tx = await nafta.connect(lender).approve(landWrapper.address, nftId);
    await tx.wait();

    await expect(landWrapper.connect(borrower).unwrapAndRemoveFromNafta(nafta.address, landId, nftId)).to.revertedWith("Only owner can unwrap NFT");
  });
});
