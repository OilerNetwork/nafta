//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockLand is ERC721 {
  uint256 constant clearLow = 0xffffffffffffffffffffffffffffffff00000000000000000000000000000000;
  uint256 constant clearHigh = 0x00000000000000000000000000000000ffffffffffffffffffffffffffffffff;
  uint256 constant factor = 0x100000000000000000000000000000000;

  mapping(uint256 => address) public updateOperator;

  modifier canSetUpdateOperator(uint256 tokenId) {
    require(msg.sender == ownerOf(tokenId), "unauthorized user");
    _;
  }

  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

  function mint(uint256 tokenId, address recipient) external {
    _mint(recipient, tokenId);
  }

  function mintXY(
    int256 x,
    int256 y,
    address recipient
  ) external {
    _mint(recipient, _encodeTokenId(x, y));
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
    return string.concat("https://api.decentraland.org/v2/contracts/0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d/tokens/", toString(tokenId));
  }

  function encodeTokenId(int256 x, int256 y) external pure returns (uint256) {
    return _encodeTokenId(x, y);
  }

  function _encodeTokenId(int256 x, int256 y) internal pure returns (uint256 result) {
    require(-1000000 < x && x < 1000000 && -1000000 < y && y < 1000000, "The coordinates should be inside bounds");
    return _unsafeEncodeTokenId(x, y);
  }

  function _unsafeEncodeTokenId(int256 x, int256 y) internal pure returns (uint256) {
    return ((uint256(x) * factor) & clearLow) | (uint256(y) & clearHigh);
  }

  function decodeTokenId(uint256 value) external pure returns (int256, int256) {
    return _decodeTokenId(value);
  }

  function _unsafeDecodeTokenId(uint256 value) internal pure returns (int256 x, int256 y) {
    x = expandNegative128BitCast((value & clearLow) >> 128);
    y = expandNegative128BitCast(value & clearHigh);
  }

  function _decodeTokenId(uint256 value) internal pure returns (int256 x, int256 y) {
    (x, y) = _unsafeDecodeTokenId(value);
    require(-1000000 < x && x < 1000000 && -1000000 < y && y < 1000000, "The coordinates should be inside bounds");
  }

  event UpdateOperator(uint256 indexed assetId, address indexed operator);

  //////////////////////////////////////
  // Utilitary functions
  //////////////////////////////////////

  function expandNegative128BitCast(uint256 value) internal pure returns (int256) {
    if (value & (1 << 127) != 0) {
      return int256(value | clearLow);
    }
    return int256(value);
  }

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
