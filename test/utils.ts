import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  MockERC721,
  MockERC721__factory,
  Nafta,
  Nafta__factory,
  MockGoodReceiver,
  MockGoodReceiver__factory,
  NFTTheftReceiver,
  NFTTheftReceiver__factory,
  AddNFTExploiter,
  AddNFTExploiter__factory,
  UniV3FlashLoan,
} from "../typechain";

export const createERC721 = async (name: string, symbol: string): Promise<MockERC721> => {
  const mockERC721Factory = (await ethers.getContractFactory("MockERC721")) as MockERC721__factory;

  const mockERC721 = await mockERC721Factory.deploy(name, symbol);
  await mockERC721.deployed();

  return mockERC721;
};

export const createNaftaPool = async (owner: string, token: string): Promise<Nafta> => {
  const NaftaFactory = (await ethers.getContractFactory("Nafta")) as Nafta__factory;

  const nafta: Nafta = await NaftaFactory.deploy(owner, token);
  await nafta.deployed();

  return nafta;
};

export const createGoodReceiver = async (): Promise<MockGoodReceiver> => {
  const MockGoodReceiverFactory = (await ethers.getContractFactory("MockGoodReceiver")) as MockGoodReceiver__factory;

  const goodReceiver: MockGoodReceiver = await MockGoodReceiverFactory.deploy();
  await goodReceiver.deployed();

  return goodReceiver;
};

export const createNFTTheftReceiver = async (): Promise<NFTTheftReceiver> => {
  const MockNFTTheftReceiverFactory = (await ethers.getContractFactory("NFTTheftReceiver")) as NFTTheftReceiver__factory;

  const badReceiver: NFTTheftReceiver = await MockNFTTheftReceiverFactory.deploy();
  await badReceiver.deployed();

  return badReceiver;
};

export const createAddNFTExploiter = async (): Promise<AddNFTExploiter> => {
  const AddNFTExploiterFactory = (await ethers.getContractFactory("AddNFTExploiter")) as AddNFTExploiter__factory;

  const exploiter: AddNFTExploiter = await AddNFTExploiterFactory.deploy();
  await exploiter.deployed();

  return exploiter;
};

export const createUniV3Flashloan = async (wrapper: string): Promise<UniV3FlashLoan> => {
  const uniV3FlashLoan = await (await ethers.getContractFactory("UniV3FlashLoan")).deploy(wrapper);

  return uniV3FlashLoan;
};

export const mintNFTAndLendToNafta = async (
  nafta: Nafta,
  nft: MockERC721,
  user: SignerWithAddress,
  nftId: number,
  fee: number,
  pricePerBlock: number,
  maxLongtermBlocks: number,
) => {
  // Minting NFT to lend
  let tx = await nft.mint(nftId, user.address);
  await tx.wait();

  // Approving nft before lending to Nafta Pool
  tx = await nft.connect(user).approve(nafta.address, nftId);
  await tx.wait();

  // Lending nft to Nafta Pool
  tx = await nafta.connect(user).addNFT(nft.address, nftId, fee, pricePerBlock, maxLongtermBlocks);
  await tx.wait();
};

export const increaseBlockNumber = async (hre: HardhatRuntimeEnvironment, blocksToIncrease: number) => {
  for (let i = 0; i < blocksToIncrease; i++) {
    hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });
  }
};

export function comparePoolNFT(poolNFT: any, bigPoolNFT: any) {
  expect(bigPoolNFT.ownerAddress).to.be.eq(poolNFT.ownerAddress);
  expect(bigPoolNFT.flashFee).to.be.eq(poolNFT.flashFee);
  expect(bigPoolNFT.pricePerBlock).to.be.eq(poolNFT.pricePerBlock);
  expect(bigPoolNFT.maxLongtermBlocks).to.be.eq(poolNFT.maxLongtermBlocks);
  expect(bigPoolNFT.inLongtermTillBlock).to.be.eq(poolNFT.inLongtermTillBlock);
  expect(bigPoolNFT.borrowerNFTId).to.be.eq(poolNFT.borrowerNFTId);
  expect(bigPoolNFT.lenderNFTId).to.be.eq(BigNumber.from(poolNFT.lenderNFTId).add(BigNumber.from(2).pow(32)));
}
