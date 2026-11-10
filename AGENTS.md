# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

On-chain protocol ("Energy Billing Automation System") that automates metering, accounting, and stablecoin settlement of electricity consumption inside a local energy market (microgrid). Solidity contracts on a Hardhat + TypeScript stack, with Python utilities for simulation and a Telegram bot. The live deployment is on **Base Sepolia**.

## Commands

```bash
yarn install            # also runs postinstall patch (see Gotchas)
yarn compile            # hardhat compile
yarn recompile          # clean + compile
yarn test               # full Hardhat/Mocha suite (test/*.test.ts)
yarn coverage           # solidity-coverage -> ./coverage
yarn size               # compiled bytecode sizes
yarn docgen             # regenerate docs/contracts/ from NatSpec

# Run a single test file or single case:
npx hardhat test test/Escrow.test.ts
npx hardhat test --grep "pays the supplier"

# Deploy / verify (script always needs an explicit --network via these aliases):
yarn deploy:base-sepolia      # canonical live target; runs scripts/typescript/deploy.ts
yarn verify:base-sepolia
yarn deploy:network <name>    # arbitrary hardhat network from hardhat.config.ts

# End-to-end demo on a network (each needs the network arg appended):
yarn demo:create <network> && yarn demo:fund <network> && yarn demo:run <network>

# Formatting (CI-relevant): yarn prettier  (sol + ts);  yarn prettier:list-different
```

Requires a `.env` (copy `.env.example`): `TESTNET_PK`/`PK`, RPC keys (`ALCHEMY_KEY`/`INFURA_KEY`), `ETHSCAN_KEY`, and optional per-network stablecoin overrides (see Gotchas).

## Architecture

**`Main` is the single source of truth.** It is a config registry holding three structs — `tokens`, `contracts`, `fees` — plus immutable `USDC`/`DAI`/`USDT` addresses. Every other contract stores only a `_main` pointer (via `ContractsBase`) and reads live config through `main().tokens()`, `main().contracts()`, `main().fees()` rather than caching addresses. Changing a contract address system-wide means calling `Main.changeContracts` / `changeTokensAddresses`, not redeploying consumers.

**Four functional contracts**, each reading `Main`:
- `Register` — mints/burns the identity NFTs; entry point for onboarding actors. Also enters/exits producers into staking.
- `EnergyOracle` — oracle providers record supplier price, energy production (mints NRGCT to producer), and consumption (increases consumer debt, burns supplier NRGCT). Mints MGT to reporters. All writes gated by `whenNotPaused`.
- `Escrow` — `payForElectricity` pulls `debt + fee` in a whitelisted stablecoin, pays supplier + fee receiver, then calls back into `EnergyOracle.updateEnergyConsumptions` to clear debt.
- `StakingReward` — accrues MGT to producers per second (`reward = MGT_TO_ORACLE_PROVIDER * elapsed / totalProducers`). Only `Register` may enter/exit staking (`onlyRegister`).

**Six tokens:** NRGCT (ERC-20, 1 per kWh), MGT (ERC-20, rewards/governance), NRGPT/NRGST/NRGOPT (ERC-721 identity NFTs for producer/supplier/oracle-provider), ELCT (ERC-1155 consumer pass keyed by supplier id). All extend the `tokens/base/` hierarchy built on Solady.

**Two access-control layers** (`OwnableEnumerableRoles` = Solady `Ownable` + `EnumerableRoles`):
1. uint256 role hashes (`keccak256("NAME")`) — e.g. `MANAGER_ROLE`, `MINTER_ROLE`/`BURNER_ROLE` on tokens, and the `ESCROW` role on `EnergyOracle`.
2. **Identity-NFT gating** — many functions check NFT ownership, not a role hash: `onlySupplier(supplierId)`, `onlyOracleProvider`, the consumer's `ELCT(supplierId)` hold check, and `isCorrectOwner(producer, id)`. When reasoning about who can call what, check both layers.

**Role wiring is mandatory and lives in `scripts/typescript/deploy.ts`** — the canonical sequence. After deploying, it grants MINTER/BURNER to the contracts that mint/burn each token, grants the `ESCROW` role to `Escrow` on `EnergyOracle`, and registers all addresses on `Main`. Cross-contract calls silently lack permission until this runs. `docs/Architecture.md` and `docs/Roles.md` document the full topology, lifecycles, and invariants — read them before changing contract interactions.

## Gotchas

- **`postinstall` patches a dependency.** `scripts/patch-hardhat-etherscan.js` rewrites the dead `solc-bin.ethereum.org` host to `binaries.soliditylang.org` inside `@nomiclabs/hardhat-etherscan`. It's idempotent; if verification fails to fetch a compiler, re-run `yarn install`.
- **Stablecoins are env-driven.** `deploy.ts` reads `<NETWORK_NAME>_<SYMBOL>` (e.g. `BASE_SEPOLIA_USDC`) for real stablecoin addresses; unset values cause it to deploy an `ERC20Mock` stand-in. Deploy output is written to `deployed/deployed_addresses_<network>.json`.
- **Two solc versions** (0.8.28 + 0.8.24) are configured; contracts pin `pragma ^0.8.28`.
- **Networks** are constructed in `hardhat.config.ts` from `utils/network.ts` (`getNetworkConfig` + `AccountTypes` selecting `PK` vs `TestnetPk`).

## Documentation (GitBook)

Docs are published to GitBook (`.gitbook.yaml`): `README.md` is the landing page, `SUMMARY.md` is the sidebar/table of contents. Hand-written pages (`Overview`, `GettingStarted`, `Deployment`, `Architecture`, `Roles`) live at the `docs/` root; `docs/contracts/` is **generated** by `yarn docgen` from NatSpec — edit the Solidity NatSpec, not those files. When adding a new hand-written doc page, also add it to `SUMMARY.md` or it won't appear in the GitBook nav.
