//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import {INafta} from "../interfaces/INafta.sol";

contract PoolFeeChanger {

    constructor() {}

    function claimOwnership(address nafta_) external {
        INafta(nafta_).claimOwnership();
    }

    function changePoolFeeNTimes(address nafta_, uint256 n) external {
        uint256 currentPoolFee = INafta(nafta_).poolFee();
        for (uint256 i = 1; i <= n; i++) {
            INafta(nafta_).changePoolFee(currentPoolFee + i * 1e16);
        }
    }
}


