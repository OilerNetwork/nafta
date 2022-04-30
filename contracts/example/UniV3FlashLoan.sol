//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import {IFlashNFTReceiver} from "../interfaces/IFlashNFTReceiver.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {INonfungiblePositionManager} from "./INonfungiblePositionManager.sol";
import {IUniV3Wrapper} from "./IUniV3Wrapper.sol";

contract UniV3FlashLoan is IFlashNFTReceiver, ERC721Holder {
    event ExecuteCalled(address nftAddress, uint256 nftId, uint256 feeInWeth, address msgSender, bytes data);

    IUniV3Wrapper public immutable wrapper;

    constructor(address wrapper_) {
        wrapper = IUniV3Wrapper(wrapper_);
    }

    /// @notice Handles Nafta flashloan to Extract UniswapV3 fees
    /// @dev This function is called by Nafta contract.
    /// @dev Nafta gives you the NFT and expects it back, so we need to approve it.
    /// @dev Also it expects feeInWeth fee paid - so should also be approved.
    /// @param nftAddress  The address of NFT contract
    /// @param nftId  The address of NFT contract
    /// @param msgSender address of the account calling the contract
    /// @param data optional calldata passed into the function optional
    /// @return returns a boolean true on success
    function executeOperation(address nftAddress, uint256 nftId, uint256 feeInWeth, address msgSender, bytes calldata data) override external returns (bool) {
        emit ExecuteCalled(nftAddress, nftId, feeInWeth, msgSender, data);

        require(nftAddress == address(wrapper), "Only Wrapped UNIV3 NFTs are supported");
        // transfer wrapped uniswap here
        
        // do the uniswap fee extraction thing
        wrapper.extractUniswapFees(nftId, msgSender);

        // Approve NFT for returning it
        wrapper.approve(msg.sender, nftId);

        return true;
    }
}