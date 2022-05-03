import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers } from "hardhat";
import { Nafta, EstateWrapper, MockWETH } from "../../typechain";
import { solidity } from "ethereum-waffle";
import { createNaftaPool } from "../utils";
import { loadAddressBook } from "../../scripts/utils/address-book-manager";

chai.use(solidity);

// For this test to work: put a FORK_URL in your .env with a  Mainnet infura/alchemy url.

describe("decentralandEstateRent", function () {
  let borrower: SignerWithAddress;
  let lender: SignerWithAddress;
  let estateWrapper: EstateWrapper;
  let mockWeth: MockWETH;
  let addresses: any;

  const estateId = "4161";

  this.beforeEach(async () => {
    // use mainnet chain id
    const addressBook = loadAddressBook(1);
    addresses = addressBook[1];

    // impersonating an account that already has Estate nft
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.decentralandEstateOwner],
    });

    lender = await ethers.getSigner(addresses.decentralandEstateOwner);

    // overriding the impersonated accounts balance to 10eth
    await hre.network.provider.send("hardhat_setBalance", [addresses.decentralandEstateOwner, ethers.utils.parseEther("10.0").toHexString()]);

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

    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);
    const estateRegistry = await ethers.getContractAt("ILANDRegistry", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await estateWrapper.connect(lender).wrap(estateId);

    // Approving nft before lending to Nafta Pool
    tx = await estateWrapper.connect(lender).approve(nafta.address, estateId);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(estateWrapper.address, estateId, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(estateWrapper.address, estateId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    // const usdc = await ethers.getContractAt("IERC20", addresses.USDC);
    // const initialBalance = await usdc.balanceOf(borrower.address);
    const operatorBefore = await estateRegistry.updateOperator(estateId);
    // console.log("Operator before:", operatorBefore);
    expect(operatorBefore).to.be.eq(ethers.constants.AddressZero);

    await nafta.connect(borrower).flashloan(estateWrapper.address, estateId, 0, estateWrapper.address, []);

    const operatorAfter = await estateRegistry.updateOperator(estateId);
    // console.log("Operator after:", operatorAfter);
    expect(operatorAfter).to.be.eq(await borrower.getAddress());
  });

  it("should change updateOperator with calldata", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);
    const estateRegistry = await ethers.getContractAt("ILANDRegistry", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await estateWrapper.connect(lender).wrap(estateId);

    // Approving nft before lending to Nafta Pool
    tx = await estateWrapper.connect(lender).approve(nafta.address, estateId);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(estateWrapper.address, estateId, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(estateWrapper.address, estateId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    // const usdc = await ethers.getContractAt("IERC20", addresses.USDC);
    // const initialBalance = await usdc.balanceOf(borrower.address);
    const operatorBefore = await estateRegistry.updateOperator(estateId);
    // console.log("Operator before:", operatorBefore);
    expect(operatorBefore).to.be.eq(ethers.constants.AddressZero);

    const randomAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    await nafta.connect(borrower).flashloan(estateWrapper.address, estateId, 0, estateWrapper.address, randomAddress);

    const operatorAfter = await estateRegistry.updateOperator(estateId);
    // console.log("Operator after:", operatorAfter);
    expect(operatorAfter).to.be.eq(randomAddress);
  });

  it("should change updateOperator back to zero after upwrap & remove from nafta", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);
    const estateRegistry = await ethers.getContractAt("ILANDRegistry", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await estateWrapper.connect(lender).wrap(estateId);

    // Approving nft before lending to Nafta Pool
    tx = await estateWrapper.connect(lender).approve(nafta.address, estateId);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(estateWrapper.address, estateId, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(estateWrapper.address, estateId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    // const usdc = await ethers.getContractAt("IERC20", addresses.USDC);
    // const initialBalance = await usdc.balanceOf(borrower.address);
    const operatorBefore = await estateRegistry.updateOperator(estateId);
    // console.log("Operator before:", operatorBefore);
    expect(operatorBefore).to.be.eq(ethers.constants.AddressZero);

    const randomAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    await nafta.connect(borrower).flashloan(estateWrapper.address, estateId, 0, estateWrapper.address, randomAddress);

    const operatorAfter = await estateRegistry.updateOperator(estateId);
    // console.log("Operator after:", operatorAfter);
    expect(operatorAfter).to.be.eq(randomAddress);

    // Wraps the nft, and lender is minted a wrapped nft
    await nafta.connect(lender).approve(estateWrapper.address, lenderNFTCount.add(1));
    await estateWrapper.connect(lender).unwrapAndRemoveFromNafta(nafta.address, estateId, lenderNFTCount.add(1));

    const operatorAfterRemoval = await estateRegistry.updateOperator(estateId);
    // console.log("Operator after removal:", operatorAfterRemoval);
    expect(operatorAfterRemoval).to.be.eq(ethers.constants.AddressZero);
  });

  it("wrapper should revert if Estate NFT was not approved", async () => {
    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    await expect(estateWrapper.connect(lender).wrap(estateId)).to.reverted;
  });

  it("should be able to unwrap successfully", async () => {
    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    // Wraps the Estate nft, and lender is minted a wrapped nft
    await estateWrapper.connect(lender).wrap(estateId);
    expect(await estate.ownerOf(estateId)).to.equal(estateWrapper.address);

    // Unwraps the Estate nft
    await estateWrapper.connect(lender).unwrap(estateId);
    expect(await estate.ownerOf(estateId)).to.equal(lender.address);
  });

  it("should revert if caller who is not owner attempting to unwrap", async () => {
    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await estateWrapper.connect(lender).wrap(estateId);
    expect(await estate.ownerOf(estateId)).to.equal(estateWrapper.address);

    await expect(estateWrapper.connect(borrower).unwrap(estateId)).to.revertedWith("Only owner can unwrap NFT");
  });

  it("should revert if called is not owner attempting to change updateOperator", async () => {
    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await estateWrapper.connect(lender).wrap(estateId);
    expect(await estate.ownerOf(estateId)).to.equal(estateWrapper.address);

    await expect(estateWrapper.connect(borrower).changeUpdateOperator(estateId, borrower.address)).to.revertedWith(
      "Only holder of wrapped Estate can change UpdateOperator",
    );
  });

  it("should be able to wrap and lend to nafta in one transaction", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    const initialBalance = await nafta.balanceOf(lender.address);
    await estateWrapper.connect(lender).wrapAndAddToNafta(estateId, nafta.address, 0, 20 * 1e9, 100);
    const finalBalance = await nafta.balanceOf(lender.address);

    expect(finalBalance).to.be.gt(initialBalance);
  });

  it("should be able to unwrap and remove from nafta in one transaction", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    await estateWrapper.connect(lender).wrapAndAddToNafta(estateId, nafta.address, 0, 20 * 1e9, 100);
    const nftId = await nafta.lenderNFTCount();

    tx = await nafta.connect(lender).approve(estateWrapper.address, nftId);
    await tx.wait();

    await estateWrapper.connect(lender).unwrapAndRemoveFromNafta(nafta.address, estateId, nftId);

    expect(await estate.ownerOf(estateId)).to.equal(lender.address);
  });

  it("should revert if not owner attempting to unwrap and remove from pool", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    const estate = await ethers.getContractAt("IERC721", addresses.decentralandEstate);

    // deploy the wrapper contract with the proper Estate addresses
    estateWrapper = await (await ethers.getContractFactory("EstateWrapper")).connect(lender).deploy(estate.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await estate.connect(lender).approve(estateWrapper.address, estateId);
    await tx.wait();

    await estateWrapper.connect(lender).wrapAndAddToNafta(estateId, nafta.address, 0, 20 * 1e9, 100);
    const nftId = await nafta.lenderNFTCount();

    tx = await nafta.connect(lender).approve(estateWrapper.address, nftId);
    await tx.wait();

    await expect(estateWrapper.connect(borrower).unwrapAndRemoveFromNafta(nafta.address, estateId, nftId)).to.revertedWith(
      "Only owner can unwrap NFT",
    );
  });
});
