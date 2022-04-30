# Nafta contracts

## Installation

1. `yarn`
2. `npx hardhat compile`

## Tests

1. `npx hardhat test`

## Coverage

1. `npx hardhat coverage`
2. Look at `coverage/index.html` for details

## Deployment

0. Follow the `Installation` steps above
1. Create `.env` file based on `.env.example` and fill with values
2. Run `npx hardhat run scripts/deploy-nafta.ts --network ropsten` (or mainnet, or kovan) and follow the instructions
3. Check `addressBook.json` for addresses
