//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import {IFlashNFTReceiver} from "../interfaces/IFlashNFTReceiver.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract MockGoodReceiver is IFlashNFTReceiver, ERC721Holder {
  event ExecuteCalled(address nftAddress, uint256 nftId, uint256 feeInWeth, address msgSender, bytes data);

  function executeOperation(
    address nftAddress,
    uint256 nftId,
    uint256 feeInWeth,
    address msgSender,
    bytes calldata data
  ) external override returns (bool) {
    emit ExecuteCalled(nftAddress, nftId, feeInWeth, msgSender, data);

    // Approve NFT for returning it
    IERC721(nftAddress).approve(msg.sender, nftId);

    return true;
  }
}
