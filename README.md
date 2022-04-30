# Nafta contracts (by Oiler.network)

This repo contains solidity contracts for Nafta marketplace.

Nafta is a platform that facilitates NFT Flash Loans & Long Term Renting without any collateral.

Website: https://nafta.market

Docs: https://docs.oiler.network/oiler-network/products/nafta

## Installation

1. `yarn`
2. `npx hardhat compile`

## Tests

1. `npx hardhat test`

## Deployment

0. Follow the `Installation` steps above
1. Create `.env` file based on `.env.example` and fill with values
2. Run `npx hardhat run scripts/deploy-nafta.ts --network ropsten` (or mainnet, or kovan) and follow the instructions
3. Check `addressBook.json` for addresses

## Coverage

1. change `yul:` to `true` in `hardhat.config.ts` optimizer settings
2. `npx hardhat coverage`
3. Look at `coverage/index.html` for details

###

    ·-----------------------------------|----------|----------|----------|----------|----------------|
    | File                              |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
    |-----------------------------------|----------|----------|----------|----------|----------------|
    | contracts/                        |      100 |    94.12 |      100 |      100 |                |
    |   Nafta.sol                       |      100 |    94.12 |      100 |      100 |                |
    | contracts/example/                |     82.5 |    66.67 |       70 |     82.5 |                |
    |   INonfungiblePositionManager.sol |      100 |      100 |      100 |      100 |                |
    |   IUniV3Wrapper.sol               |      100 |      100 |      100 |      100 |                |
    |   UniV3FlashLoan.sol              |        0 |        0 |        0 |        0 |... 31,35,38,40 |
    |   UniV3Wrapper.sol                |    97.06 |       80 |     87.5 |    97.06 |            123 |
    | contracts/interfaces/             |      100 |      100 |      100 |      100 |                |
    |   IFlashNFTReceiver.sol           |      100 |      100 |      100 |      100 |                |
    |   INafta.sol                      |      100 |      100 |      100 |      100 |                |
    | contracts/test/                   |       95 |      100 |      100 |    94.74 |                |
    |   AddNFTExploiter.sol             |       75 |      100 |      100 |       75 |             24 |
    |   GoodReceiver.sol                |      100 |      100 |      100 |      100 |                |
    |   MockNFT.sol                     |      100 |      100 |      100 |      100 |                |
    |   MockWeth.sol                    |      100 |      100 |      100 |      100 |                |
    |   NFTTheftReceiver.sol            |      100 |      100 |      100 |      100 |                |
    |   PoolFeeChanger.sol              |      100 |      100 |      100 |      100 |                |
    |-----------------------------------|----------|----------|----------|----------|----------------|
    | All files                         |    94.81 |    90.24 |    91.67 |    94.74 |                |
    |-----------------------------------|----------|----------|----------|----------|----------------|

## Gas usage

    ·-----------------------------------------------|---------------------------|----------------·
    |             Solc version: 0.8.10              ·  Optimizer enabled: true  ·  Runs: 999999  │
    ················································|···························|·················
    |  Methods                                                                                   │
    ···················|····························|·············|·············|·················
    |  Contract        ·  Method                    ·  Min        ·  Max        ·  Avg           │
    |  Nafta           ·  addNFT                    ·     127834  ·     162202  ·        158296  │
    |  Nafta           ·  approve                   ·          -  ·          -  ·         48663  │
    |  Nafta           ·  changePoolFee             ·      69238  ·      69250  ·         69247  │
    |  Nafta           ·  claimOwnership            ·          -  ·          -  ·         30009  │
    |  Nafta           ·  editNFT                   ·      37184  ·      37328  ·         37232  │
    |  Nafta           ·  flashloan                 ·     101998  ·     260657  ·        129973  │
    |  Nafta           ·  longRent                  ·     123553  ·     172737  ·        159906  │
    |  Nafta           ·  proposeNewOwner           ·          -  ·          -  ·         46097  │
    |  Nafta           ·  removeNFT                 ·          -  ·          -  ·         77568  │
    |  Nafta           ·  transferFrom              ·          -  ·          -  ·         62180  │
    |  Nafta           ·  updateLongRent            ·      27098  ·      38878  ·         31025  │
    |  Nafta           ·  withdrawEarnings          ·      36463  ·      53078  ·         47540  │
    ···················|····························|·············|·············|·················
    |  UniV3Wrapper    ·  approve                   ·          -  ·          -  ·         48674  │
    |  UniV3Wrapper    ·  unwrap                    ·          -  ·          -  ·        105212  │
    |  UniV3Wrapper    ·  unwrapAndRemoveFromNafta  ·          -  ·          -  ·        183821  │
    |  UniV3Wrapper    ·  wrap                      ·          -  ·          -  ·        187970  │
    |  UniV3Wrapper    ·  wrapAndAddToNafta         ·          -  ·          -  ·        325836  │
    ·-----------------------------------------------|-------------|-------------|----------------·
