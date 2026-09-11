# Energy Billing Automation System

The Energy Billing Automation System is a comprehensive solution designed to automate the processes of data collection, analysis, and billing for electricity consumption among different participants in the energy market.

## Who this is for & the problem it solves

**Target audience:** local communities in Ukraine that organized ad-hoc microgrids during blackouts — neighbors with shared solar panels, batteries, or a generator who produce and split electricity among themselves. The same applies to any small community running peer-to-peer energy exchange.

**The pain:** once neighbors share power from a common source, there's no transparent way to calculate who contributed how much, who consumed how much, and who owes whom. Today it's manual and trust-based (spreadsheets) — which causes disputes and discourages people from investing in shared generation capacity, since there's no guarantee they'll get their fair share back.

**The fix:** metering data reaches the chain through an oracle layer, and smart contracts — not a neighbor's word — calculate and settle debts automatically, transparently, and verifiably on-chain. See the full [Overview](docs/Overview.md) for the complete picture.

## Features

- Automated calculation of electricity costs based on contract terms and tariff rates
- Secure data handling and information protection
- Real-time monitoring of electricity consumption
- Generation of accurate and detailed bills for energy market participants

## Live Deployment

DefiEnergySupply is fully deployed and operational on **Base Sepolia** testnet.

### Quick Links

| Resource                               | Link                                                                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation (GitBook)                | https://b0gdaniy.gitbook.io/defi-energy-supply/                                                                                                                                                                                     |
| Source code (contracts)                | https://github.com/passat-b6-tdi/defi-energy-supply                                                                                                                                                                                 |
| Source code (subgraph)                 | https://github.com/passat-b6-tdi/defi-energy-supply-subgraph                                                                                                                                                                        |
| GraphQL playground                     | https://api.studio.thegraph.com/query/59239/defi-energy-supply-base-sepolia/version/latest/                                                                                                                                         |
| Monitoring dashboard (Grafana, IP)     | [https://13.62.49.115.sslip.io](https://13.62.49.115.sslip.io/d/energy-dashboard/energy-metrics-dashboard?orgId=1&from=now-6h&to=now&timezone=browser&refresh=10s)                                                                  |
| Monitoring dashboard (Grafana, tunnel) | [ https://laboratories-cult-large-outstanding.trycloudflare.com](https://laboratories-cult-large-outstanding.trycloudflare.com/d/energy-dashboard/energy-metrics-dashboard?orgId=1&from=now-6h&to=now&timezone=browser&refresh=10s) |

### Smart Contracts (Base Sepolia)

#### Core

| Contract      | Address                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Main          | [0x8ff2093Bb6B358214EF950bCe9AEB486EDadA40A](https://sepolia.basescan.org/address/0x8ff2093Bb6B358214EF950bCe9AEB486EDadA40A) |
| Register      | [0x6A7a5178299f3257d7f35343719F6C577dE4A0f3](https://sepolia.basescan.org/address/0x6A7a5178299f3257d7f35343719F6C577dE4A0f3) |
| Escrow        | [0x55f5662efffb06418DB2b36e98cd53B86BC7D466](https://sepolia.basescan.org/address/0x55f5662efffb06418DB2b36e98cd53B86BC7D466) |
| EnergyOracle  | [0xb7a26DC03a9BB0d31b8770e4Fb88027AD705Ba06](https://sepolia.basescan.org/address/0xb7a26DC03a9BB0d31b8770e4Fb88027AD705Ba06) |
| StakingReward | [0xEf12a92cb95c15A5FC422b9d3Ba64E360C2ED1c8](https://sepolia.basescan.org/address/0xEf12a92cb95c15A5FC422b9d3Ba64E360C2ED1c8) |

#### Tokens

| Token                        | Symbol | Address                                                                                                                       |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Microgrid Governance Token   | MGT    | [0x669F43B25f42Cd2CB3E490d9DE3684F5CE768C73](https://sepolia.basescan.org/address/0x669F43B25f42Cd2CB3E490d9DE3684F5CE768C73) |
| Energy Producer Token        | NRGPT  | [0xd18BCf2C6169165D374c782790a2831237ADbde6](https://sepolia.basescan.org/address/0xd18BCf2C6169165D374c782790a2831237ADbde6) |
| Energy Credit Token          | NRGCT  | [0xb2Ebf583b75723bAe5B6F6Dc6613eC252f66Fd94](https://sepolia.basescan.org/address/0xb2Ebf583b75723bAe5B6F6Dc6613eC252f66Fd94) |
| Energy Supplier Token        | NRGST  | [0xffF664489fa997f6Ec6147fe8D6d459d4C5607dC](https://sepolia.basescan.org/address/0xffF664489fa997f6Ec6147fe8D6d459d4C5607dC) |
| Energy Oracle Provider Token | NRGOPT | [0x36B60AA01B880253EA97f44e5b75070F9caD1DBe](https://sepolia.basescan.org/address/0x36B60AA01B880253EA97f44e5b75070F9caD1DBe) |
| Electricity Consumer Token   | ELCT   | [0x2EDF0D97D70fe186C9A283681cbA8C8F6707AFBB](https://sepolia.basescan.org/address/0x2EDF0D97D70fe186C9A283681cbA8C8F6707AFBB) |

#### Mock Stablecoins (for testing)

| Token | Address                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| USDC  | [0xE7dd5A4D81Be2b511EA958934e02c216c6C7Ec38](https://sepolia.basescan.org/address/0xE7dd5A4D81Be2b511EA958934e02c216c6C7Ec38) |
| DAI   | [0x875A66DC00c190416c11ee387daF7d65f0474050](https://sepolia.basescan.org/address/0x875A66DC00c190416c11ee387daF7d65f0474050) |
| USDT  | [0x3d1f856a1258FEcd940aCD46b3DF3dCD935b4792](https://sepolia.basescan.org/address/0x3d1f856a1258FEcd940aCD46b3DF3dCD935b4792) |

### Try the Subgraph

Example query — last 10 energy oracle readings:

```graphql
{
  energyOracleReadings(first: 10, orderBy: blockTimestamp, orderDirection: desc) {
    id
    consumer
    supplier
    energyAmount
    blockTimestamp
  }
}
```

Open it in the [GraphQL playground →](https://api.studio.thegraph.com/query/59239/defi-energy-supply-base-sepolia/version/latest/).

## Tech Stack

- **Solidity** `0.8.20` smart contracts (OpenZeppelin, Solady)
- **Hardhat** development environment with TypeScript
- **Python** utilities for simulation and Telegram bot integration
- Target network: **BASE Sepolia**

## Project Structure

```
contracts/        Solidity sources (Main, Register, Escrow, EnergyOracle, StakingReward, base, mocks, tokens)
scripts/
  typescript/     Hardhat deploy & verify scripts
  python/         Simulation and Telegram bot scripts
test/             Hardhat test suites
deployed/         Deployment artifacts
docs/             Generated documentation
```

## Installation

1. Clone the repository:

```
git clone https://github.com/passat-b6-tdi/defi-energy-supply.git
cd defi-energy-supply
```

2. Install the required dependencies:

```
yarn install
```

3. Copy `.env.example` to `.env` and fill in the required environment variables.

## Available Scripts

### Build & Test

- `yarn clean` — Removes the build artifacts.
- `yarn compile` — Compiles the smart contracts.
- `yarn recompile` — Cleans and then compiles the smart contracts.
- `yarn test` — Runs the smart contract tests.
- `yarn coverage` — Generates a code coverage report.
- `yarn size` — Calculates the size of the compiled smart contracts.
- `yarn docgen` — Generates documentation for the smart contracts.

### Deployment & Verification

- `yarn run:script <path>` — Runs an arbitrary Hardhat script.
- `yarn deploy:network <network>` — Deploys to the given Hardhat network.
- `yarn deploy:base-sepolia` — Deploys all contracts to Base Sepolia (the live deployment network).
- `yarn verify:network <network>` — Verifies deployed contracts on the given network.
- `yarn verify:base-sepolia` — Verifies contracts on Base Sepolia.

### Formatting

- `yarn prettier` — Formats Solidity and TypeScript sources.
- `yarn prettier:sol` — Formats Solidity sources only.
- `yarn prettier:ts` — Formats JavaScript/TypeScript sources only.
- `yarn prettier:json:md` — Formats JSON and Markdown files.

## Contributing

We welcome contributions from the community to enhance the Energy Billing Automation System. To contribute, please follow these steps:

1. Fork the repository.

2. Create a new branch.

3. Make your modifications or add new features.

4. Submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).
