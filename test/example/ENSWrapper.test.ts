import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers } from "hardhat";
import { Nafta, ENSWrapper, MockWETH, ENS, IBaseRegistrar } from "../../typechain";
import { solidity } from "ethereum-waffle";
import { createNaftaPool } from "../utils";
import { loadAddressBook } from "../../scripts/utils/address-book-manager";

chai.use(solidity);

// For this test to work: put a FORK_URL in your .env with a  Mainnet infura/alchemy url.

describe("ENSWrappers", function () {
  let naftaOwner: SignerWithAddress;
  let borrower: SignerWithAddress;
  let lender: SignerWithAddress;
  let ensWrapper: ENSWrapper;
  let mockWeth: MockWETH;
  let addresses: any;
  let ens: IBaseRegistrar;
  let ensRegistry: ENS;

  const ensTokenId = "79233663829379634837589865448569342784712482819484549289560981379859480642508";
  const ensNodeHash = "0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835";
  const ensOwner = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045".toLowerCase();

  this.beforeEach(async () => {
    // use mainnet chain id
    const addressBook = loadAddressBook(1);
    addresses = addressBook[1];

    // impersonating an account that already has LAND nft
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ensOwner],
    });

    lender = await ethers.getSigner(ensOwner);

    // overriding the impersonated accounts balance to 10eth
    await hre.network.provider.send("hardhat_setBalance", [ensOwner, ethers.utils.parseEther("10.0").toHexString()]);

    [naftaOwner, borrower] = await ethers.getSigners();

    mockWeth = (await (await ethers.getContractFactory("MockWETH")).deploy()) as MockWETH;
    await mockWeth.deployed();

    ens = await ethers.getContractAt("IBaseRegistrar", addresses.ENSRegistrar);

    const ensRegistryAddress = await ens.ens();
    ensRegistry = await ethers.getContractAt("ENS", ensRegistryAddress);
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

  it("should change Controller with wrapper directly", async () => {
    // deploy the wrapper contract with the proper ENS address
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await ensWrapper.connect(lender).wrap(ensTokenId);

    const controllerBefore = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller before:", controllerBefore);
    expect(controllerBefore.toLowerCase()).to.be.eq(ensOwner);

    await ensWrapper.setController(ensTokenId, await borrower.getAddress());

    const controllerAfter = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller after:", controllerAfter);

    expect(controllerAfter).to.be.not.eq(controllerBefore);
    expect(controllerAfter).to.be.eq(await borrower.getAddress());
  });

  it("should change Controller with wrapper via Nafta", async () => {
    const nafta: Nafta = await createNaftaPool(naftaOwner.address, mockWeth.address);

    // deploy the wrapper contract with the proper Land addresses
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await ensWrapper.connect(lender).wrap(ensTokenId);

    // Approving nft before lending to Nafta Pool
    tx = await ensWrapper.connect(lender).approve(nafta.address, ensTokenId);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(ensWrapper.address, ensTokenId, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(ensWrapper.address, ensTokenId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    const controllerBefore = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller before:", controllerBefore);
    expect(controllerBefore.toLowerCase()).to.be.eq(ensOwner);

    await nafta.connect(borrower).flashloan(ensWrapper.address, ensTokenId, 0, ensWrapper.address, []);

    const controllerAfter = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller after:", controllerAfter);

    expect(controllerAfter).to.be.not.eq(controllerBefore);
    expect(controllerAfter).to.be.eq(await borrower.getAddress());
  });

  it("should change Controller with wrapper via Nafta with calldata", async () => {
    const nafta: Nafta = await createNaftaPool(naftaOwner.address, mockWeth.address);

    // deploy the wrapper contract with the proper Land addresses
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await ensWrapper.connect(lender).wrap(ensTokenId);

    // Approving nft before lending to Nafta Pool
    tx = await ensWrapper.connect(lender).approve(nafta.address, ensTokenId);
    await tx.wait();

    const lenderNFTCount = await nafta.lenderNFTCount();

    // Lending nft to Nafta Pool
    await expect(nafta.connect(lender).addNFT(ensWrapper.address, ensTokenId, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(ensWrapper.address, ensTokenId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), lender.address);

    const controllerBefore = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller before:", controllerBefore);
    expect(controllerBefore.toLowerCase()).to.be.eq(ensOwner);

    const randomAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    await nafta.connect(borrower).flashloan(ensWrapper.address, ensTokenId, 0, ensWrapper.address, randomAddress);

    const controllerAfter = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller after:", controllerAfter);

    expect(controllerAfter).to.be.not.eq(controllerBefore);
    expect(controllerAfter).to.be.eq(randomAddress);
  });

  it("should change Controller back to original Owner after upwrap", async () => {
    // deploy the wrapper contract with the proper ENS address
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await ensWrapper.connect(lender).wrap(ensTokenId);

    const controllerBefore = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller before:", controllerBefore);
    expect(controllerBefore.toLowerCase()).to.be.eq(ensOwner);

    await ensWrapper.setController(ensTokenId, await borrower.getAddress());

    const controllerAfter = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller after:", controllerAfter);

    expect(controllerAfter).to.be.not.eq(controllerBefore);
    expect(controllerAfter).to.be.eq(await borrower.getAddress());

    await ensWrapper.connect(lender).unwrap(ensTokenId);

    const controllerAfterUnwrap = await ensRegistry.owner(ensNodeHash);
    // console.log("Controller after unwrap:", controllerAfterUnwrap);
    expect(controllerAfterUnwrap).to.be.eq(controllerBefore);
  });

  it("wrapper should revert if ENS NFT was not approved", async () => {
    // deploy the wrapper contract with the proper Land addresses
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    await expect(ensWrapper.connect(lender).wrap(ensTokenId)).to.be.reverted;
  });

  it("should be able to unwrap successfully", async () => {
    // deploy the wrapper contract with the proper Land addresses
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    // Wraps the ENS nft, and lender is minted a wrapped nft
    await ensWrapper.connect(lender).wrap(ensTokenId);
    expect(await ens.ownerOf(ensTokenId)).to.equal(ensWrapper.address);
    expect(await ensWrapper.ownerOf(ensTokenId)).to.equal(await lender.getAddress());

    // Unwraps the ENS nft,
    await ensWrapper.connect(lender).unwrap(ensTokenId);
    expect(await ens.ownerOf(ensTokenId)).to.equal(lender.address);
  });

  it("should revert if caller who is not owner attempting to unwrap", async () => {
    // deploy the wrapper contract with the proper Land addresses
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    // Wraps the ENS nft, and lender is minted a wrapped nft
    await ensWrapper.connect(lender).wrap(ensTokenId);
    expect(await ens.ownerOf(ensTokenId)).to.equal(ensWrapper.address);
    expect(await ensWrapper.ownerOf(ensTokenId)).to.equal(await lender.getAddress());

    await expect(ensWrapper.connect(borrower).unwrap(ensTokenId)).to.revertedWith("Only owner can unwrap NFT");
  });

  it("should revert if not owner is attempting to change Controller", async () => {
    // deploy the wrapper contract with the proper ENS address
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    // Wraps the nft, and lender is minted a wrapped nft
    await ensWrapper.connect(lender).wrap(ensTokenId);

    await expect(ensWrapper.connect(borrower).setController(ensTokenId, await borrower.getAddress())).to.revertedWith(
      "Only holder of wrapped ENS can set Controller",
    );
  });

  it("should be able to wrap and lend to nafta in one transaction", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    // deploy the wrapper contract with the proper ENS address
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    const initialBalance = await nafta.balanceOf(lender.address);

    // Lending nft to Nafta Pool
    const lenderNFTCount = await nafta.lenderNFTCount();
    await expect(ensWrapper.connect(lender).wrapAndAddToNafta(ensTokenId, nafta.address, 0, 20 * 1e9, 100))
      .to.emit(nafta, "AddNFT")
      .withArgs(ensWrapper.address, ensTokenId, 0, BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), ensWrapper.address);

    const finalBalance = await nafta.balanceOf(lender.address);

    expect(finalBalance).to.be.gt(initialBalance);
    expect(await ensWrapper.ownerOf(ensTokenId)).to.be.eq(nafta.address);
    expect(await ens.ownerOf(ensTokenId)).to.be.eq(ensWrapper.address);
  });

  it("should be able to unwrap and remove from nafta in one transaction", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    // deploy the wrapper contract with the proper ENS address
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    const initialBalance = await nafta.balanceOf(lender.address);

    // Lending nft to Nafta Pool
    const lenderNFTCount = await nafta.lenderNFTCount();
    await ensWrapper.connect(lender).wrapAndAddToNafta(ensTokenId, nafta.address, 0, 20 * 1e9, 100);

    expect(await ens.ownerOf(ensTokenId)).to.not.equal(lender.address);

    const nftId = await nafta.lenderNFTCount();

    tx = await nafta.connect(lender).approve(ensWrapper.address, nftId);
    await tx.wait();

    await ensWrapper.connect(lender).unwrapAndRemoveFromNafta(nafta.address, ensTokenId, nftId);

    expect(await ens.ownerOf(ensTokenId)).to.equal(lender.address);
  });

  it("should revert if not owner attempting to unwrap and remove from pool", async () => {
    const nafta: Nafta = await createNaftaPool(lender.address, mockWeth.address);

    // deploy the wrapper contract with the proper ENS address
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    // Approving nft to wrapper contract before wrapping
    let tx = await ens.connect(lender).approve(ensWrapper.address, ensTokenId);
    await tx.wait();

    const initialBalance = await nafta.balanceOf(lender.address);

    // Lending nft to Nafta Pool
    const lenderNFTCount = await nafta.lenderNFTCount();
    await ensWrapper.connect(lender).wrapAndAddToNafta(ensTokenId, nafta.address, 0, 20 * 1e9, 100);

    expect(await ens.ownerOf(ensTokenId)).to.not.equal(lender.address);

    const nftId = await nafta.lenderNFTCount();

    tx = await nafta.connect(lender).approve(ensWrapper.address, nftId);
    await tx.wait();

    await expect(ensWrapper.connect(borrower).unwrapAndRemoveFromNafta(nafta.address, ensTokenId, nftId)).to.revertedWith(
      "Only owner can unwrap NFT",
    );
  });

  it("tokenURI generates proper url", async () => {
    // deploy the wrapper contract with the proper ENS address
    ensWrapper = await (await ethers.getContractFactory("ENSWrapper")).connect(lender).deploy(ens.address);

    const url = await ensWrapper.tokenURI(ensTokenId);
    const expectedUrl = "https://metadata.ens.domains/mainnet/" + ens.address.toLowerCase() + "/" + ensTokenId + "/";
    expect(url).to.be.eq(expectedUrl);
  });
});
