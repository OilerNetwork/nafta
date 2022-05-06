//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockEstate is ERC721 {
  mapping(uint256 => address) public updateOperator;

  modifier canSetUpdateOperator(uint256 tokenId) {
    require(msg.sender == ownerOf(tokenId), "unauthorized user");
    _;
  }

  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

  function mint(uint256 tokenId, address recipient) external {
    _mint(recipient, tokenId);
  }

  /**
   * @notice Set LAND updateOperator
   * @param assetId - LAND id
   * @param operator - address of the account to be set as the updateOperator
   */
  function setUpdateOperator(uint256 assetId, address operator) public canSetUpdateOperator(assetId) {
    updateOperator[assetId] = operator;
    emit UpdateOperator(assetId, operator);
  }

  function tokenURI(uint256 tokenId) public pure override returns (string memory) {
    return string.concat("https://api.decentraland.org/v2/contracts/0x959e104e1a4db6317fa58f8295f586e1a978c297/tokens/", toString(tokenId));
  }

  event UpdateOperator(uint256 indexed assetId, address indexed operator);

  //////////////////////////////////////
  // Utilitary functions
  //////////////////////////////////////

  function toString(uint256 value) internal pure returns (string memory) {
    // Inspired by OraclizeAPI's implementation - MIT licence
    // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

    if (value == 0) {
      return "0";
    }
    uint256 temp = value;
    uint256 digits;
    while (temp != 0) {
      digits++;
      temp /= 10;
    }
    bytes memory buffer = new bytes(digits);
    while (value != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
      value /= 10;
    }
    return string(buffer);
  }
}
