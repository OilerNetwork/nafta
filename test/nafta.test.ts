import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { BigNumber, utils } from "ethers";
import hre, { ethers } from "hardhat";
import { Nafta, MockWETH, MockGoodReceiver, MockERC721, NFTTheftReceiver, AddNFTExploiter, PoolFeeChanger } from "../typechain";
import {
  createNaftaPool,
  createERC721,
  createGoodReceiver,
  createNFTTheftReceiver,
  mintNFTAndLendToNafta,
  increaseBlockNumber,
  createAddNFTExploiter,
  comparePoolNFT,
} from "./utils";
import { solidity } from "ethereum-waffle";

chai.use(solidity);

describe("Nafta Pool tests", function () {
  let owner: SignerWithAddress;
  let sender1: SignerWithAddress;
  let sender2: SignerWithAddress;
  let mockWeth: MockWETH;
  let mockGoodReceiver: MockGoodReceiver;

  this.beforeAll(async () => {
    [owner, sender1, sender2] = await ethers.getSigners();

    // Deploy WETH mock
    mockWeth = (await (await ethers.getContractFactory("MockWETH")).deploy()) as MockWETH;
    await mockWeth.deployed();

    // Deploy IFlashNFTReceiver that behaves good
    mockGoodReceiver = (await (await ethers.getContractFactory("MockGoodReceiver")).deploy()) as MockGoodReceiver;
    await mockGoodReceiver.deployed();
  });

  this.beforeEach(async () => {
    let tx = await mockWeth.setPaused(false);
    await tx.wait();
  });

  describe("Liquidity providers actions", () => {
    it("should correctly add new NFTs", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Minting NFT to lend
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      // Aproving nft before lending to Nafta Pool
      tx = await nft.approve(nafta.address, 1);
      await tx.wait();

      const lenderNFTCount = await nafta.lenderNFTCount();

      // Lending nft to Nafta Pool
      await expect(nafta.addNFT(nft.address, 1, 50 * 1e9, 20 * 1e9, 100))
        .to.emit(nafta, "AddNFT")
        .withArgs(nft.address, 1, BigNumber.from(50 * 1e9), BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), owner.address);

      // Checking correct state
      const poolNFT = await nafta.poolNFTs(nft.address, 1);
      expect(poolNFT[0]).to.be.equal(BigNumber.from(50 * 1e9));
      expect(poolNFT[1]).to.be.equal(BigNumber.from(20 * 1e9));
      expect(poolNFT[2]).to.be.equal(BigNumber.from(100));
      expect(poolNFT[3]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[4]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[5]).to.be.equal(BigNumber.from(lenderNFTCount.add(1)).sub(BigNumber.from(2).pow(32)));
    });

    it("should revert if NFT was not approved", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Minting NFT to lend
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      await expect(nafta.addNFT(nft.address, 1, 10 * 1e9, 20 * 1e9, 100)).to.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("should revert if NFT was approved but the caller is not the owner", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Minting NFT to lend
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      // Aproving nft before lending to Nafta Pool
      tx = await nft.approve(nafta.address, 1);
      await tx.wait();

      // Lending nft to Nafta Pool
      await expect(nafta.connect(sender1).addNFT(nft.address, 1, 10 * 1e9, 20 * 1e9, 100)).to.revertedWith(
        "ERC721: transfer of token that is not own",
      );
    });

    it("should correctly remove the NFT from the Pool", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      const lenderNFTCount = await nafta.lenderNFTCount();

      // Should emit RemoveNFT event
      await expect(nafta.removeNFT(nft.address, 1)).to.emit(nafta, "RemoveNFT").withArgs(nft.address, 1, lenderNFTCount, owner.address);

      // NFT Owner should be the original one
      expect(await nft.ownerOf(1)).to.be.equal(owner.address);
      // Checking if state is correct
      const poolNFT = await nafta.poolNFTs(nft.address, 1);
      expect(poolNFT[0]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[1]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[2]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[3]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[4]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[5]).to.be.equal(BigNumber.from(0));
    });

    it("should revert if try to remove an NFT which is rented", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, 1000 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 1 * 1e9, 2 * 1e9, 100);

      // Should emit event LongtermRent
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 6)).to.emit(nafta, "LongtermRent");

      // NFT is rented
      await expect(nafta.removeNFT(nft.address, 1)).to.be.revertedWith("Can't remove NFT from the pool while in longterm rent");
    });

    it("should revert if try to remove an NFT which is not in the Pool", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Minting NFT to lend
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      // Approving nft before lending to Nafta Pool
      tx = await nft.approve(nafta.address, 1);
      await tx.wait();

      // Should revert because the NFT is not in the pool
      await expect(nafta.removeNFT(nft.address, 1)).to.revertedWith("ERC721: owner query for nonexistent token");
    });

    it("should revert if the account trying to remove the NFT is not the original owner", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Should revert because the caller is not the NFT owner.
      await expect(nafta.connect(sender1).removeNFT(nft.address, 1)).to.revertedWith("Only owner of the corresponding LenderNFT can call this");
    });

    it("should revert if editNFT is not called by the NFT owner", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Minting NFT to lend
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      // Aproving nft before lending to Nafta Pool
      tx = await nft.approve(nafta.address, 1);
      await tx.wait();

      const lenderNFTCount = await nafta.lenderNFTCount();

      // Lending nft to Nafta Pool
      await expect(nafta.addNFT(nft.address, 1, 50 * 1e9, 20 * 1e9, 100))
        .to.emit(nafta, "AddNFT")
        .withArgs(nft.address, 1, BigNumber.from(50 * 1e9), BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), owner.address);

      await expect(nafta.connect(sender1).editNFT(nft.address, 1, 50 * 1e9, 20 * 1e9, 100)).to.be.revertedWith(
        "Only owner of the corresponding LenderNFT can call this",
      );
    });

    it("should correctly edit the NFT", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Minting NFT to lend
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      // Aproving nft before lending to Nafta Pool
      tx = await nft.approve(nafta.address, 1);
      await tx.wait();

      const lenderNFTCount = await nafta.lenderNFTCount();

      // Lending nft to Nafta Pool
      await expect(nafta.addNFT(nft.address, 1, 50 * 1e9, 20 * 1e9, 100))
        .to.emit(nafta, "AddNFT")
        .withArgs(nft.address, 1, BigNumber.from(50 * 1e9), BigNumber.from(20 * 1e9), BigNumber.from(100), lenderNFTCount.add(1), owner.address);

      await expect(nafta.editNFT(nft.address, 1, 60 * 1e9, 30 * 1e9, 200))
        .to.emit(nafta, "EditNFT")
        .withArgs(nft.address, 1, BigNumber.from(60 * 1e9), BigNumber.from(30 * 1e9), BigNumber.from(200), lenderNFTCount.add(1), owner.address);

      // Checking correct state
      const poolNFT = await nafta.poolNFTs(nft.address, 1);
      expect(poolNFT[0]).to.be.equal(BigNumber.from(60 * 1e9));
      expect(poolNFT[1]).to.be.equal(BigNumber.from(30 * 1e9));
      expect(poolNFT[2]).to.be.equal(BigNumber.from(200));
      expect(poolNFT[3]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[4]).to.be.equal(BigNumber.from(0));
      expect(poolNFT[5]).to.be.equal(BigNumber.from(lenderNFTCount.add(1)).sub(BigNumber.from(2).pow(32)));
    });
  });

  describe("Protocol fees payouts", () => {
    it("should correctly withdraw earnings", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 100 * 1e9);
      await tx.wait();
      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Approving balance for paying loan
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10 * 1e9);
      await tx.wait();

      // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, goodReceiver.address, [])).to.emit(goodReceiver, "ExecuteCalled");

      const earnedFees = await nafta.earnings(
        await nafta.ownerOf(BigNumber.from((await nafta.poolNFTs(nft.address, 1)).lenderNFTId).add(BigNumber.from(2).pow(32))),
      );
      const beforeBalance = await mockWeth.balanceOf(owner.address);

      // Should emit correct event
      expect(nafta.withdrawEarnings()).to.emit(nafta, "WithdrawEarnings").withArgs(earnedFees, owner.address);

      // Earned fees should be set to zero
      expect(
        await nafta.earnings(await nafta.ownerOf(BigNumber.from((await nafta.poolNFTs(nft.address, 1)).lenderNFTId).add(BigNumber.from(2).pow(32)))),
      ).to.be.equal(BigNumber.from(0));

      // Owner should received the earned fees
      expect(await mockWeth.balanceOf(owner.address)).to.be.gte(beforeBalance.add(earnedFees));
    });

    it("should revert if there are no earnings", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Should emit correct event
      expect(nafta.withdrawEarnings()).to.be.revertedWith("No earnings to withdraw");
    });

    it("should revert if the earnings transfer fails", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 100 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Approving balance for paying loan
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10 * 1e9);
      await tx.wait();

      // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, goodReceiver.address, [])).to.emit(goodReceiver, "ExecuteCalled");

      // pause the mockWETH
      tx = await mockWeth.setPaused(true);
      await tx.wait();

      // Should emit correct event
      expect(nafta.withdrawEarnings()).to.be.revertedWith("WETH9 transfer failed");
    });
  });

  describe("LongRent", () => {
    it("should revert if longRent is called for an NFT that is not in the pool", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Mint NFT
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      // Should revert because NFT is not in the Pool
      await expect(nafta.longRent(nft.address, 1, 20 * 1e9, owner.address, 10)).to.be.revertedWith("This NFT isn't available for longterm rent");
    });

    it("should revert if try to longRent an NFT that is not allowed for longRent", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 0, 100);

      await expect(nafta.longRent(nft.address, 1, 0, sender1.address, 2)).to.be.revertedWith("This NFT isn't available for longterm rent");
    });

    it("should revert if trying to longRent an NFT that is already longRent", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();
      tx = await mockWeth.mint(sender2.address, 1000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.approve(nafta.address, 10 * 1e9);
      await tx.wait();
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10 * 1e9);
      await tx.wait();
      tx = await mockWeth.connect(sender2).approve(nafta.address, 10 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 1 * 1e9, 2 * 1e9, 100);

      // Long Rent NFT
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 5)).to.be.not.reverted;

      // Should revert if someone try to long rent an already long rented NFT
      await expect(nafta.connect(sender2).longRent(nft.address, 1, 2 * 1e9, sender2.address, 5)).to.be.revertedWith(
        "Can't rent longterm because it's already rented",
      );

      // Should revert if someone try to long rent an already long rented NFT even if is the user which is renting
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender2.address, 5)).to.be.revertedWith(
        "Can't rent longterm because it's already rented",
      );

      // Should revert if someone try to long rent an already long rented NFT even if is the original owner
      await expect(nafta.longRent(nft.address, 1, 2 * 1e9, sender2.address, 5)).to.be.revertedWith("Can't rent longterm because it's already rented");
    });

    it("should revert if the longRent is not correctly paid", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 1 * 1e9, 2 * 1e9, 100);

      // Should revert if not enough funds were approved
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 6)).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance",
      );
    });

    it("should send longterm NFT to the correct receiver when longRent", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, 1000 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 1 * 1e9, 2 * 1e9, 100);
      await mintNFTAndLendToNafta(nafta, nft, owner, 2, 1 * 1e9, 2 * 1e9, 100);

      // Should emit event LongtermRent
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 6)).to.emit(nafta, "LongtermRent");

      // borrowerNFT Id
      let borrowerNFT = (await nafta.poolNFTs(nft.address, 1)).borrowerNFTId;

      // Receiver address must receive the rent NFT
      expect(await nafta.ownerOf(borrowerNFT)).to.be.equal(sender1.address);

      // Should emit event LongtermRent
      await expect(nafta.connect(sender1).longRent(nft.address, 2, 2 * 1e9, sender2.address, 6)).to.emit(nafta, "LongtermRent");

      // borrowerNFT Id
      borrowerNFT = (await nafta.poolNFTs(nft.address, 2)).borrowerNFTId;

      // Receiver address must receive the rent NFT
      expect(await nafta.ownerOf(borrowerNFT)).to.be.equal(sender2.address);
    });

    it("should correctly increase borrowerNFTCount after longRent", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, 1000 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 1 * 1e9, 2 * 1e9, 100);

      // Fetch borrowerNFTCount
      let borrowerNFTCountBefore = await nafta.borrowerNFTCount();

      // Should longRent
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 6)).to.be.not.reverted;

      // NFTCount must be increased
      expect(await nafta.borrowerNFTCount()).to.be.equal(borrowerNFTCountBefore.add(1));
    });

    it("should correcty add fees to the original owner and to the pool when longRent", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender2.address, 2000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender2).approve(nafta.address, 2000 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, sender1, 1, 1 * 1e9, 100 * 1e9, 100);

      // Fetching the fees before longRent
      let earnedFeesBefore = await nafta.earnings(
        await nafta.ownerOf(BigNumber.from((await nafta.poolNFTs(nft.address, 1)).lenderNFTId).add(BigNumber.from(2).pow(32))),
      );

      // Renting NFT# 1, should emit event LongtermRent
      await expect(nafta.connect(sender2).longRent(nft.address, 1, 100 * 1e9, sender2.address, 10)).to.emit(nafta, "LongtermRent");

      // Should put all the payment into the earned fees
      expect(
        await nafta.earnings(await nafta.ownerOf(BigNumber.from((await nafta.poolNFTs(nft.address, 1)).lenderNFTId).add(BigNumber.from(2).pow(32)))),
      ).to.be.equal(earnedFeesBefore.add(1000 * 1e9));

      // Increase block number by less than rent time
      increaseBlockNumber(hre, 10);

      // Set new pool fee to 0.50%
      expect(await nafta.changePoolFee(BigInt(5e15))).to.emit(nafta, "PoolFeeChanged");

      // Fetching the earnings before longRent
      earnedFeesBefore = await nafta.earnings(
        await nafta.ownerOf(BigNumber.from((await nafta.poolNFTs(nft.address, 1)).lenderNFTId).add(BigNumber.from(2).pow(32))),
      );
      let poolFeesBefore = await nafta.earnings(await nafta.owner());

      // Should emit event LongtermRent
      await expect(nafta.connect(sender2).longRent(nft.address, 1, 100 * 1e9, sender1.address, 10)).to.emit(nafta, "LongtermRent");

      // Should correctly distributes the payment
      expect(
        await nafta.earnings(await nafta.ownerOf(BigNumber.from((await nafta.poolNFTs(nft.address, 1)).lenderNFTId).add(BigNumber.from(2).pow(32)))),
      ).to.be.equal(earnedFeesBefore.add(995 * 1e9));
      expect(await nafta.earnings(await nafta.owner())).to.be.equal(poolFeesBefore.add(5 * 1e9));
    });

    it("should update longterm correctly", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, 1000 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 1 * 1e9, 2 * 1e9, 100);
      await mintNFTAndLendToNafta(nafta, nft, owner, 2, 1 * 1e9, 2 * 1e9, 100);

      // Should emit event LongtermRent
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 20)).to.emit(nafta, "LongtermRent");

      // borrowerNFT Id
      let borrowerNFT = (await nafta.poolNFTs(nft.address, 1)).borrowerNFTId;

      // Receiver address must receive the rent NFT
      expect(await nafta.ownerOf(borrowerNFT)).to.be.equal(sender1.address);

      // Increase block number by less than rent time
      increaseBlockNumber(hre, 2);

      // Calling updateLongRent
      tx = await nafta.updateLongRent(nft.address, 1);
      await tx.wait();

      // Receiver address must still have the NFT
      expect(await nafta.ownerOf(borrowerNFT)).to.be.equal(sender1.address);

      // Increase block number and pass rent time
      increaseBlockNumber(hre, 20);

      // Calling updateLongRent
      await expect(nafta.updateLongRent(nft.address, 1)).to.be.not.reverted;

      // NFT should be burned
      await expect(nafta.ownerOf(borrowerNFT)).to.be.revertedWith("ERC721: owner query for nonexistent token");

      // PoolNFT should have correct sate
      const poolNFT = await nafta.poolNFTs(nft.address, 1);
      expect(poolNFT.borrowerNFTId).to.be.equal(0);
      expect(poolNFT.inLongtermTillBlock).to.be.equal(0);
    });

    it("should revert if the price set by the user is lower than the one in the pool", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, 1000 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 1 * 1e9, 2 * 1e9, 100);

      // Should revert
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 1 * 1e9, sender1.address, 20)).to.be.revertedWith(
        "Can't rent the NFT with the selected price",
      );
    });

    it("should revert if trying to rent for more than 100 blocks", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1_000_000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, 500_000 * 1e9);

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 1 * 1e9, 2 * 1e9, 100);
      await tx.wait();

      // Should revert if called with more than 195000 blocks
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 105)).to.be.revertedWith(
        "NFT can't be rented for that amount of time",
      );

      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 101)).to.be.revertedWith(
        "NFT can't be rented for that amount of time",
      );

      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 100)).to.be.not.reverted;
    });

    it("should revert if trying to rent for less than the flashloan price", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");

      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, 1_000_000 * 1e9);
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, 500_000 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 3 * 1e9, 1 * 1e9, 100);

      // Should revert if called with more than 195000 blocks
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 2 * 1e9, sender1.address, 1)).to.be.revertedWith(
        "Longterm rent can't be cheaper than flashloan",
      );
    });
  });

  describe("Pool parameters manipulation", () => {
    it("should correctly change the pool fee", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      // Pool fee should be initially 0
      expect(await nafta.poolFee()).to.be.equal(0);

      // Should emit event when the PoolFee is changed
      await expect(nafta.changePoolFee(BigInt(5e15)))
        .to.emit(nafta, "PoolFeeChanged")
        .withArgs(BigInt(5e15));

      // The new value should be returned as the pool fee
      expect(await nafta.poolFee()).to.be.equal(BigInt(5e15));
    });

    it("should allow to change the pool fee by 1 percentage point", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      // Pool fee should be initially 0
      expect(await nafta.poolFee()).to.be.equal(0);

      // Should emit event when the PoolFee is changed
      await expect(nafta.changePoolFee(BigInt(1e16)))
        .to.emit(nafta, "PoolFeeChanged")
        .withArgs(BigInt(1e16));

      // The new value should be returned as the pool fee
      expect(await nafta.poolFee()).to.be.equal(BigInt(1e16));
    });

    it("should revert if changePoolFee is not called by the admin", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      // Should revert because it wasn't called by the admin
      await expect(nafta.connect(sender1).changePoolFee(BigInt(5e17))).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if changePoolFee is called with value that differs more than 1 percentage point", async () => {
      // Deploying contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      // Should revert because it wasn't called by the admin
      await expect(nafta.changePoolFee(BigNumber.from(BigInt(1e16)).add(1))).to.be.revertedWith(
        "Can't change the pool fee more than one percentage point in one step",
      );
    });

    it("Shouldn't allow to change poolFee more than once per block", async () => {
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const poolFeeChanger: PoolFeeChanger = await (await ethers.getContractFactory("PoolFeeChanger")).deploy();
      await nafta.proposeNewOwner(poolFeeChanger.address);
      await poolFeeChanger.claimOwnership(nafta.address);
      await expect(poolFeeChanger.changePoolFeeNTimes(nafta.address, 2)).to.be.revertedWith("Can't change the pool fee more than once in a block");
    });
  });

  describe("Flashloan", () => {
    it("should correctly flashloan", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 100 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Approving balance for paying loan
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10 * 1e9);
      await tx.wait();

      const data = new utils.Interface(["function balanceOf(address)"]).getSighash("balanceOf");

      // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, goodReceiver.address, data))
        .to.emit(goodReceiver, "ExecuteCalled")
        .withArgs(nft.address, 1, 10 * 1e9, sender1.address, data);

      // The NFT should be in the Pool
      expect(await nft.ownerOf(1)).to.be.equal(nafta.address);
    });

    it("should revert if the NFT not exist", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      const data = new utils.Interface(["function balanceOf(address)"]).getSighash("balanceOf");

      // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, goodReceiver.address, data)).to.be.revertedWith(
        "ERC721: owner query for nonexistent token",
      );
    });

    it("should revert if the NFT is not in the Pool", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Mint an nft
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      const data = new utils.Interface(["function balanceOf(address)"]).getSighash("balanceOf");

      // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, goodReceiver.address, data)).to.be.revertedWith(
        "NFT should be in the pool",
      );
    });

    it("should revert if the NFT is not sent back", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const badReceiver: NFTTheftReceiver = await createNFTTheftReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 100 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Approving balance for paying loan
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10);
      await tx.wait();

      // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, badReceiver.address, [])).to.revertedWith(
        "ERC721: transfer caller is not owner nor approved",
      );

      // The NFT should be in the Pool
      expect(await nft.ownerOf(1)).to.be.equal(nafta.address);
    });

    it("should revert if the flashloan is not paid", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 100 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, goodReceiver.address, [])).to.revertedWith(
        "ERC20: transfer amount exceeds allowance",
      );

      // The NFT should be in the Pool
      expect(await nft.ownerOf(1)).to.be.equal(nafta.address);
    });

    it("should revert if try to flashloan a longterm rented NFT and don't have the BorrowerNFT", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(owner.address, 1000 * 1e9);
      await tx.wait();
      tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving balances for paying loan
      tx = await mockWeth.connect(owner).approve(nafta.address, 500 * 1e9);
      await tx.wait();
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Longterm rent by user
      await expect(nafta.longRent(nft.address, 1, 20 * 1e9, owner.address, 20)).to.not.be.reverted;

      const data = new utils.Interface(["function balanceOf(address)"]).getSighash("balanceOf");

      // Try to take flashloan on longterm rented NFT
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, goodReceiver.address, data)).to.revertedWith(
        "This NFT is in longterm rent - you can't flashloan it unless you have corresponding BorrowerNFT",
      );

      // The NFT should be in the Pool
      expect(await nft.ownerOf(1)).to.be.equal(nafta.address);
    });

    it("should be able to flashloans without paying if it has longterm rented the NFT", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(owner.address, 1000 * 1e9);
      await tx.wait();

      // Approving balances for paying loan
      tx = await mockWeth.approve(nafta.address, 400 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Longterm rent by user
      await expect(nafta.longRent(nft.address, 1, 20 * 1e9, owner.address, 20)).to.not.be.reverted;

      // Remove every allowance to Nafta Pool
      tx = await mockWeth.approve(nafta.address, 0);
      await tx.wait();

      const data = new utils.Interface(["function balanceOf(address)"]).getSighash("balanceOf");

      // Should be able to take multiple flashloans
      await expect(nafta.flashloan(nft.address, 1, 0, goodReceiver.address, data))
        .to.emit(goodReceiver, "ExecuteCalled")
        .withArgs(nft.address, 1, 0, owner.address, data);

      increaseBlockNumber(hre, 10);

      await expect(nafta.flashloan(nft.address, 1, 0, goodReceiver.address, data))
        .to.emit(goodReceiver, "ExecuteCalled")
        .withArgs(nft.address, 1, 0, owner.address, data);

      // The NFT should be in the Pool
      expect(await nft.ownerOf(1)).to.be.equal(nafta.address);
    });

    it("should allow only the owner of the correct BorrowerNFT to take the flashloans", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(owner.address, 1000 * 1e9);
      await tx.wait();

      // Approving balances for paying loan
      tx = await mockWeth.approve(nafta.address, 400 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Longterm rent by user
      await expect(nafta.longRent(nft.address, 1, 20 * 1e9, owner.address, 20)).to.not.be.reverted;

      // Remove every allowance to Nafta Pool
      tx = await mockWeth.approve(nafta.address, 0);
      await tx.wait();

      const data = new utils.Interface(["function balanceOf(address)"]).getSighash("balanceOf");

      // Should be able to take the flashloans
      await expect(nafta.flashloan(nft.address, 1, 0, goodReceiver.address, data))
        .to.emit(goodReceiver, "ExecuteCalled")
        .withArgs(nft.address, 1, 0, owner.address, data);

      // Should revert if don't have the BorrowerNFT
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 0, goodReceiver.address, data)).to.be.revertedWith(
        "This NFT is in longterm rent - you can't flashloan it unless you have corresponding BorrowerNFT",
      );

      // Change owner of BorrowerNFT
      await expect(nafta.transferFrom(owner.address, sender1.address, 1)).to.be.not.reverted;

      // Should revert if don't have the BorrowerNFT
      await expect(nafta.flashloan(nft.address, 1, 0, goodReceiver.address, data)).to.be.revertedWith(
        "This NFT is in longterm rent - you can't flashloan it unless you have corresponding BorrowerNFT",
      );

      // Should be able to take the flashloans
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 0, goodReceiver.address, data))
        .to.emit(goodReceiver, "ExecuteCalled")
        .withArgs(nft.address, 1, 0, sender1.address, data);

      // The NFT should be in the Pool
      expect(await nft.ownerOf(1)).to.be.equal(nafta.address);
    });

    it("should revert if the price set for the borrower is lower than the one in the pool", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 100 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Approving balance for paying loan
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10 * 1e9);
      await tx.wait();

      // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 5 * 1e9, goodReceiver.address, [])).to.be.revertedWith(
        "You can't take the flashloan for the indicated price",
      );

      // The NFT should be in the Pool
      expect(await nft.ownerOf(1)).to.be.equal(nafta.address);
    });

    it("should revert if an account try to re-add a flashloaned NFT", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const addNFTExploiter: AddNFTExploiter = await createAddNFTExploiter();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 100 * 1e9);
      await tx.wait();
      tx = await mockWeth.mint(addNFTExploiter.address, 100 * 1e9);
      await tx.wait();
      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);

      // Approving balance for paying loan
      tx = await mockWeth.connect(sender1).approve(nafta.address, 10 * 1e9);
      await tx.wait();
      // Approving balance for paying loan
      tx = await mockWeth.connect(addNFTExploiter.signer).approve(nafta.address, 10 * 1e9);
      await tx.wait();

      const data = new utils.Interface(["function balanceOf(address)"]).getSighash("balanceOf");

      console.log("Trying to flashloan");
      // // Take flashloan
      await expect(nafta.connect(sender1).flashloan(nft.address, 1, 10 * 1e9, await addNFTExploiter.address, data)).to.be.revertedWith(
        "NFT is already in the Pool",
      );
    });
  });

  describe("Protocol earnings management", () => {
    it("should correctly withdrawPoolEarnings", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving balances for paying loan
      tx = await mockWeth.connect(sender1).approve(nafta.address, 800 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);
      await mintNFTAndLendToNafta(nafta, nft, owner, 2, 20 * 1e9, 20 * 1e9, 100);

      // Setting pool fee
      await expect(nafta.changePoolFee(BigInt(5e15))).to.be.not.reverted;

      // Longterm rent by user
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 20 * 1e9, owner.address, 20)).to.not.be.reverted;

      // Take flashloan of NFT 2
      await expect(nafta.connect(sender1).flashloan(nft.address, 2, 20 * 1e9, goodReceiver.address, [])).to.be.not.reverted;

      // Fetch data before withdrawing
      const poolFees = await nafta.earnings(await nafta.owner());
      const adminBalanceBefore = await mockWeth.balanceOf(owner.address);

      // Withdrawn Pool fees
      await expect(nafta.connect(owner).withdrawEarnings()).to.be.not.reverted;

      // The admin should receive the correct amount
      expect(await mockWeth.balanceOf(owner.address)).to.be.equal(adminBalanceBefore.add(poolFees));

      // Pool state should be correct
      expect(await nafta.earnings(await nafta.owner())).to.be.equal(0);
    });

    it("should revert if the withdrawPoolEarnings transfer fails", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      const nft: MockERC721 = await createERC721("Test NFT", "TNFT");
      const goodReceiver: MockGoodReceiver = await createGoodReceiver();

      // Add weth balance to borrower
      let tx = await mockWeth.mint(sender1.address, 1000 * 1e9);
      await tx.wait();

      // Approving balances for paying loan
      tx = await mockWeth.connect(sender1).approve(nafta.address, 800 * 1e9);
      await tx.wait();

      await mintNFTAndLendToNafta(nafta, nft, owner, 1, 10 * 1e9, 20 * 1e9, 100);
      await mintNFTAndLendToNafta(nafta, nft, owner, 2, 20 * 1e9, 20 * 1e9, 100);

      // Setting pool fee
      await expect(nafta.changePoolFee(BigInt(5e15))).to.be.not.reverted;

      // Longterm rent by user
      await expect(nafta.connect(sender1).longRent(nft.address, 1, 20 * 1e9, owner.address, 20)).to.not.be.reverted;

      // Take flashloan of NFT 2
      await expect(nafta.connect(sender1).flashloan(nft.address, 2, 20 * 1e9, goodReceiver.address, [])).to.be.not.reverted;

      // Fetch data before withdrawing
      const poolFees = await nafta.earnings(await nafta.owner());
      const adminBalanceBefore = await mockWeth.balanceOf(owner.address);

      // pause the MockWeth
      tx = await mockWeth.setPaused(true);
      await tx.wait();

      // Withdrawn Pool fees
      await expect(nafta.connect(owner).withdrawEarnings()).to.be.revertedWith("WETH9 transfer failed");
    });
  });

  describe("Utility functions - toBigPoolNFT", () => {
    it("Should accept zero values", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      const poolNFT = {
        flashFee: BigNumber.from(0),
        pricePerBlock: BigNumber.from(0),
        maxLongtermBlocks: BigNumber.from(0),
        inLongtermTillBlock: BigNumber.from(0),
        borrowerNFTId: BigNumber.from(0),
        lenderNFTId: BigNumber.from(0),
      };

      const bigPoolNFT = await nafta.toBigPoolNFT(poolNFT);
      comparePoolNFT(poolNFT, bigPoolNFT);
    });

    it("Should accept normal values", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      const poolNFT = {
        flashFee: BigNumber.from(42),
        pricePerBlock: BigNumber.from(42),
        maxLongtermBlocks: BigNumber.from(42),
        inLongtermTillBlock: BigNumber.from(42),
        borrowerNFTId: BigNumber.from(42),
        lenderNFTId: BigNumber.from(42),
      };

      const bigPoolNFT = await nafta.toBigPoolNFT(poolNFT);
      comparePoolNFT(poolNFT, bigPoolNFT);
    });

    it("Should accept maximum values", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      const poolNFT = {
        flashFee: BigNumber.from(2).pow(72).sub(1),
        pricePerBlock: BigNumber.from(2).pow(72).sub(1),
        maxLongtermBlocks: BigNumber.from(2).pow(24).sub(1),
        inLongtermTillBlock: BigNumber.from(2).pow(32).sub(1),
        borrowerNFTId: BigNumber.from(2).pow(32).sub(1),
        lenderNFTId: BigNumber.from(2).pow(32).sub(1),
      };

      const bigPoolNFT = await nafta.toBigPoolNFT(poolNFT);
      comparePoolNFT(poolNFT, bigPoolNFT);
    });
  });

  describe("Utility functions - fromBigPoolNFT", () => {
    it("Should accept minimum in-range values", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      const bigPoolNFT = {
        flashFee: BigNumber.from(0),
        pricePerBlock: BigNumber.from(0),
        maxLongtermBlocks: BigNumber.from(0),
        inLongtermTillBlock: BigNumber.from(0),
        borrowerNFTId: BigNumber.from(0),
        lenderNFTId: BigNumber.from(2).pow(32),
      };

      const poolNFT = await nafta.fromBigPoolNFT(bigPoolNFT);
      comparePoolNFT(poolNFT, bigPoolNFT);
    });

    it("Should accept normal in-range values", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      const bigPoolNFT = {
        flashFee: BigNumber.from(42),
        pricePerBlock: BigNumber.from(42),
        maxLongtermBlocks: BigNumber.from(42),
        inLongtermTillBlock: BigNumber.from(42),
        borrowerNFTId: BigNumber.from(42),
        lenderNFTId: BigNumber.from(2).pow(32).add(BigNumber.from(42)),
      };

      const poolNFT = await nafta.fromBigPoolNFT(bigPoolNFT);
      comparePoolNFT(poolNFT, bigPoolNFT);
    });

    it("Should accept maximum in-range values", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      const bigPoolNFT = {
        flashFee: BigNumber.from(2).pow(72).sub(1),
        pricePerBlock: BigNumber.from(2).pow(72).sub(1),
        maxLongtermBlocks: BigNumber.from(2).pow(24).sub(1),
        inLongtermTillBlock: BigNumber.from(2).pow(32).sub(1),
        borrowerNFTId: BigNumber.from(2).pow(32).sub(1),
        lenderNFTId: BigNumber.from(2).pow(32).add(BigNumber.from(2).pow(32).sub(1)),
      };

      const poolNFT = await nafta.fromBigPoolNFT(bigPoolNFT);
      comparePoolNFT(poolNFT, bigPoolNFT);
    });

    it("Should revert for out-of-range values", async () => {
      // Deploy contracts
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);

      let bigPoolNFT;

      bigPoolNFT = {
        flashFee: BigNumber.from(2).pow(72),
        pricePerBlock: BigNumber.from(2).pow(72).sub(1),
        maxLongtermBlocks: BigNumber.from(2).pow(24).sub(1),
        inLongtermTillBlock: BigNumber.from(2).pow(32).sub(1),
        borrowerNFTId: BigNumber.from(2).pow(32).sub(1),
        lenderNFTId: BigNumber.from(2).pow(32).add(BigNumber.from(2).pow(32).sub(1)),
      };
      await expect(nafta.fromBigPoolNFT(bigPoolNFT)).to.be.revertedWith("flashFee doesn't fit in uint72");

      bigPoolNFT = {
        flashFee: BigNumber.from(2).pow(72).sub(1),
        pricePerBlock: BigNumber.from(2).pow(72),
        maxLongtermBlocks: BigNumber.from(2).pow(24).sub(1),
        inLongtermTillBlock: BigNumber.from(2).pow(32).sub(1),
        borrowerNFTId: BigNumber.from(2).pow(32).sub(1),
        lenderNFTId: BigNumber.from(2).pow(32).add(BigNumber.from(2).pow(32).sub(1)),
      };
      await expect(nafta.fromBigPoolNFT(bigPoolNFT)).to.be.revertedWith("pricePerBlock doesn't fit in uint72");

      bigPoolNFT = {
        flashFee: BigNumber.from(2).pow(72).sub(1),
        pricePerBlock: BigNumber.from(2).pow(72).sub(1),
        maxLongtermBlocks: BigNumber.from(2).pow(24),
        inLongtermTillBlock: BigNumber.from(2).pow(32).sub(1),
        borrowerNFTId: BigNumber.from(2).pow(32).sub(1),
        lenderNFTId: BigNumber.from(2).pow(32).add(BigNumber.from(2).pow(32).sub(1)),
      };
      await expect(nafta.fromBigPoolNFT(bigPoolNFT)).to.be.revertedWith("maxLongtermBlocks doesn't fit in uint24");

      bigPoolNFT = {
        flashFee: BigNumber.from(2).pow(72).sub(1),
        pricePerBlock: BigNumber.from(2).pow(72).sub(1),
        maxLongtermBlocks: BigNumber.from(2).pow(24).sub(1),
        inLongtermTillBlock: BigNumber.from(2).pow(32),
        borrowerNFTId: BigNumber.from(2).pow(32).sub(1),
        lenderNFTId: BigNumber.from(2).pow(32).add(BigNumber.from(2).pow(32).sub(1)),
      };
      await expect(nafta.fromBigPoolNFT(bigPoolNFT)).to.be.revertedWith("inLongtermTillBlock doesn't fit in uint32");

      bigPoolNFT = {
        flashFee: BigNumber.from(2).pow(72).sub(1),
        pricePerBlock: BigNumber.from(2).pow(72).sub(1),
        maxLongtermBlocks: BigNumber.from(2).pow(24).sub(1),
        inLongtermTillBlock: BigNumber.from(2).pow(32).sub(1),
        borrowerNFTId: BigNumber.from(2).pow(32),
        lenderNFTId: BigNumber.from(2).pow(32).add(BigNumber.from(2).pow(32).sub(1)),
      };
      await expect(nafta.fromBigPoolNFT(bigPoolNFT)).to.be.revertedWith("borrowerNFTId doesn't fit in uint32");

      bigPoolNFT = {
        flashFee: BigNumber.from(2).pow(72).sub(1),
        pricePerBlock: BigNumber.from(2).pow(72).sub(1),
        maxLongtermBlocks: BigNumber.from(2).pow(24).sub(1),
        inLongtermTillBlock: BigNumber.from(2).pow(32).sub(1),
        borrowerNFTId: BigNumber.from(2).pow(32).sub(1),
        lenderNFTId: BigNumber.from(2).pow(32).add(BigNumber.from(2).pow(32)),
      };
      await expect(nafta.fromBigPoolNFT(bigPoolNFT)).to.be.revertedWith("lenderNFTId doesn't fit in uint32");
    });
  });

  describe("Overflow checks", () => {
    let nafta: Nafta;
    let nft: MockERC721;

    this.beforeEach(async () => {
      // Deploying contracts
      nafta = await createNaftaPool(owner.address, mockWeth.address);
      nft = await createERC721("Test NFT", "TNFT");

      // Minting NFT to lend
      let tx = await nft.mint(1, owner.address);
      await tx.wait();

      // Aproving nft before lending to Nafta Pool
      tx = await nft.approve(nafta.address, 1);
      await tx.wait();
    });

    it("addNFT should not overflow from in-range values", async () => {
      await expect(
        nafta.addNFT(
          nft.address,
          1,
          BigNumber.from(2).pow(72).sub(1),
          BigNumber.from(2).pow(72).sub(1), //////////////
          BigNumber.from(2).pow(24).sub(1),
        ),
      ).to.be.not.reverted;
    });

    it("addNFT should overflow from out-of-range values", async () => {
      await expect(
        nafta.addNFT(
          nft.address,
          1,
          BigNumber.from(2).pow(72),
          BigNumber.from(2).pow(72).sub(1), //////////////
          BigNumber.from(2).pow(24).sub(1),
        ),
      ).to.be.revertedWith("flashFee doesn't fit in uint72");

      await expect(
        nafta.addNFT(
          nft.address,
          1,
          BigNumber.from(2).pow(72).sub(1),
          BigNumber.from(2).pow(72), //////////////
          BigNumber.from(2).pow(24).sub(1),
        ),
      ).to.be.revertedWith("pricePerBlock doesn't fit in uint72");

      await expect(
        nafta.addNFT(
          nft.address,
          1,
          BigNumber.from(2).pow(72).sub(1),
          BigNumber.from(2).pow(72).sub(1), //////////////
          BigNumber.from(2).pow(24),
        ),
      ).to.be.revertedWith("maxLongtermBlocks doesn't fit in uint24");
    });

    it("editNFT should not overflow from in-range values", async () => {
      await nafta.addNFT(nft.address, 1, 2, 3, 4);

      await expect(
        nafta.editNFT(
          nft.address,
          1,
          BigNumber.from(2).pow(72).sub(1),
          BigNumber.from(2).pow(72).sub(1), //////////////
          BigNumber.from(2).pow(24).sub(1),
        ),
      ).to.be.not.reverted;
    });

    it("editNFT should overflow from out-of-range values", async () => {
      await nafta.addNFT(nft.address, 1, 2, 3, 4);

      await expect(
        nafta.editNFT(
          nft.address,
          1,
          BigNumber.from(2).pow(72),
          BigNumber.from(2).pow(72).sub(1), //////////////
          BigNumber.from(2).pow(24).sub(1),
        ),
      ).to.be.revertedWith("flashFee doesn't fit in uint72");

      await expect(
        nafta.editNFT(
          nft.address,
          1,
          BigNumber.from(2).pow(72).sub(1),
          BigNumber.from(2).pow(72), //////////////
          BigNumber.from(2).pow(24).sub(1),
        ),
      ).to.be.revertedWith("pricePerBlock doesn't fit in uint72");

      await expect(
        nafta.editNFT(
          nft.address,
          1,
          BigNumber.from(2).pow(72).sub(1),
          BigNumber.from(2).pow(72).sub(1), //////////////
          BigNumber.from(2).pow(24),
        ),
      ).to.be.revertedWith("maxLongtermBlocks doesn't fit in uint24");
    });

    it("longRent should not revert with in-range values", async () => {
      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, BigNumber.from(2).pow(32));
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, BigNumber.from(2).pow(32));
      await tx.wait();

      await nafta.addNFT(nft.address, 1, 1, 1, BigNumber.from(2).pow(24).sub(1));

      // Long Rent NFT
      await expect(
        nafta.connect(sender1).longRent(
          nft.address,
          1,
          BigNumber.from(2).pow(256).sub(1), ////////////////////
          sender1.address,
          BigNumber.from(2).pow(24).sub(1), // Blocks = uint24.max
        ),
      ).to.be.not.reverted;
    });

    it("longRent should revert with out-of-range values", async () => {
      // Adding balance to users for renting
      let tx = await mockWeth.mint(sender1.address, BigNumber.from(2).pow(32));
      await tx.wait();

      // Approving funds for paying the NFT rent
      tx = await mockWeth.connect(sender1).approve(nafta.address, BigNumber.from(2).pow(32));
      await tx.wait();

      await nafta.addNFT(nft.address, 1, 1, 1, BigNumber.from(2).pow(24).sub(1));

      // Long Rent NFT
      await expect(
        nafta.connect(sender1).longRent(
          nft.address,
          1,
          BigNumber.from(2).pow(256).sub(1), ////////////////////
          sender1.address,
          BigNumber.from(2).pow(24), // Blocks > uint24.max
        ),
      ).to.be.revertedWith("NFT can't be rented for that amount of time");
    });
  });

  describe("Ownership Transfer Test", () => {
    it("Should transfer ownership if it was proposed", async () => {
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      expect(await nafta.owner()).to.equal(owner.address);
      await nafta.proposeNewOwner(sender1.address);
      await nafta.connect(sender1).claimOwnership();
      expect(await nafta.owner()).to.equal(sender1.address);
    });
    it("Should not allow to ownership transfer if claiming from a wrong address", async () => {
      const nafta: Nafta = await createNaftaPool(owner.address, mockWeth.address);
      expect(await nafta.owner()).to.equal(owner.address);
      expect(await nafta.proposedOwner()).to.not.equal(sender1.address);
      await expect(nafta.connect(sender1).claimOwnership()).to.be.revertedWith("Only proposed owner can claim the ownership");
      expect(await nafta.owner()).to.equal(owner.address);
    });
  });
});
