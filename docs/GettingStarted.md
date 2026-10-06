# Getting started

This page walks through cloning, configuring, testing, and deploying the
Energy Billing Automation System.

## Prerequisites

- Node.js ≥ 18
- `yarn` package manager
- An `.env` file with the values described in `.env.example`
  (RPC URLs, deployer private key, block-explorer API keys)

## Install

```bash
git clone https://github.com/b0gdaniy/defi-energy-supply.git
cd defi-energy-supply
yarn install
cp .env.example .env   # then fill in the values
```

## Compile & test

```bash
yarn compile     # builds the contracts
yarn test        # runs the Hardhat test suite
yarn coverage    # generates a coverage report under ./coverage
yarn size        # prints compiled-bytecode sizes
```

## Generate API docs

```bash
yarn docgen
```

This populates `docs/contracts/` with one Markdown page per Solidity file,
generated from the in-source NatSpec. Hand-written pages
(`Overview.md`, `Architecture.md`, `Roles.md`, `GettingStarted.md`) and
the GitBook table of contents (`SUMMARY.md`) live at the `docs/` root and
are untouched by `yarn docgen`.

## Deploy to Base Sepolia

```bash
yarn deploy:base-sepolia   # runs scripts/typescript/deploy.ts on base_sepolia
yarn verify:base-sepolia   # verifies the deployed contracts on Basescan
```

The deployment script handles token deployment, contract deployment, and
all the role wiring described in [Access control](Roles.md).

## Interact

After deployment, addresses are stored under `deployed/` and as CSV under
`deployed-addresses-csv/`. Typical interactions:

| Actor             | Action                                      | Contract & method                                                           |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Protocol manager  | Register a new producer / supplier / OP     | `Register.register{Producer,Supplier,OracleProvider}`                       |
| Supplier          | Onboard a consumer                          | `Register.registerElectricityConsumer(consumer, supplierId)`                |
| Oracle provider   | Publish a supplier price / production / use | `EnergyOracle.record{SupplierPrice,EnergyProductions,ConsumerConsumptions}` |
| Consumer          | Pay for electricity                         | `Escrow.payForElectricity(supplierId, paymentToken)`                        |
| Producer          | Claim accumulated MGT rewards               | `StakingReward.getProducerRewards(producerId)`                              |

See the contract-level docs under [Contracts](contracts/Main.md) for the
full ABI and per-method requirements.
