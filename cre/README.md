# DES CRE workflow

Chainlink CRE workflow that turns a signed (SIMULATED) meter reading into a tariff-priced consumption record.
Onchain receiver: `contracts/cre/DESReadingReceiver.sol`. Tariff: `docs/cre/TariffPolicy-v1.md`
(policyHash `0xb7ac31c3a7df955e9c91398a82e7d17dfa24e72fa368175c91977ef889e9f266`).

```
mock meter (Bun) --signed JSON--> CRE workflow (cron, 60 s) --report--> KeystoneForwarder --> DESReadingReceiver
```

Per tick the workflow reads `nextSequence()` and `lastPeriodEnd()` from the receiver, fetches reading `nextSequence`
from the meter with `consensusIdenticalAggregation` over the raw body, validates it off-chain with the same rules as the
contract (including the EIP-712 signer), then signs a report `abi.encode(Reading, bytes signature)` and calls `writeReport`.
A reading that fails validation is logged and not written.

## Layout

| Path | Purpose |
| --- | --- |
| `project.yaml` | Targets `staging-base` (Base Sepolia) and `staging-arc` (Arc Testnet) with RPCs |
| `des-reading/` | Workflow (`workflow.ts`), per-target configs `config.base.json`, `config.arc.json` |
| `mock-meter/` | Bun server that signs SIMULATED readings, plus tests |
| `scripts/digest-vector.ts` | Cross-language check, paired with `foundry/test/DESReadingDigestVector.t.sol` |

## Setup

```bash
cd cre/des-reading && bun install
cd ../mock-meter && bun install
cd ../scripts && bun install
```

Mock meter key: `cre/mock-meter/.env` holds a DEMO key made with `cast wallet new`. It signs simulated readings only and
holds no funds. `.env` is gitignored. Copy `.env.example` to make your own. The workflow config field `meterSigner` must be
the address of that key, and `CONSUMER` / `consumer` must be the consumer you register onchain (currently the placeholder
`0x...dEaD`).

Geo-block note: the official `rpc.testnet.arc.network` returns Cloudflare error 1009 from some regions (seen from
Ukraine). `project.yaml` therefore uses dRPC for Arc: `https://arc-testnet.drpc.org`.

## Mock meter

```bash
cd cre/mock-meter
set -a; . ./.env; set +a
bun run start            # http://localhost:8787
bun test
```

`GET /meters/:meterId/readings/:sequence?chainId=...&receiver=0x...&chainSelector=...`

- The signature is bound to the EIP-712 domain (`DESReadingReceiver`, `1`, chainId, receiver). Query params
  `chainId`, `receiver`, `chainSelector` select the target. If a param is missing, env `CHAIN_ID`, `RECEIVER_ADDRESS`,
  `CHAIN_SELECTOR` is used. The workflow always sends all three from its config.
- Readings are immutable per (meterId, chainId, receiver, sequence). The first request creates the reading and stores it in
  memory and in `readings.json`. Every later request returns the same bytes, which identical DON consensus needs.
  Delete `readings.json` and restart to reset after a redeploy.
- `periodEnd = floor(now/60)*60`, `periodStart = max(periodEnd - 60, previous periodEnd)`. If the previous period has
  not ended yet the server answers `425`.
- Scenario (`scenario.json`, SIMULATED): seq 1 normal (1500 Wh, THD 300, PF 9800), seq 2 high THD (1200), seq 3 low PF
  (9000), seq 4 both, then repeat. Resulting prices: 120, 108, 126, 113 per Wh.

## Checks

```bash
cd cre/des-reading && bun run typecheck && bun test
cd cre && cre workflow build des-reading -T staging-base -o /tmp/des.wasm
cd cre/mock-meter && bun test
cd cre/scripts && bun run digest-vector.ts     # compare with the constants in the forge test
forge test --match-contract DESReadingDigestVectorTest
```

## Simulate (no transactions)

```bash
cd cre
cre workflow simulate des-reading --target staging-base --non-interactive --trigger-index 0
cre workflow simulate des-reading --target staging-arc  --non-interactive --trigger-index 0
```

Without `--broadcast` writes are a dry run. While `receiverAddress` is the `0x00...00` placeholder the receiver read has no
code behind it, so the run stops with `no contract data from 0x000...` before any HTTP or write step. Fill in the real
receiver first, and start the mock meter.

## Deploy and live run (USER-ONLY, these send transactions)

Do these yourself with a funded testnet key. They are not run by the automation that built this folder.

1. Arc Testnet: deploy the DES system (USER-ONLY).
   ```bash
   export USDC=<arc usdc address> DEPLOYER=<your address>
   forge script foundry/script/DeployDesTestnet.s.sol --rpc-url https://arc-testnet.drpc.org --broadcast --account <keystore>
   ```
   Note the printed `EnergyOracle`, `Register`, `NRGCT` addresses.
2. Deploy `DESReadingReceiver` on each chain (USER-ONLY). Use the forwarder from the CRE forwarder directory: MockForwarder
   for `--broadcast` simulation (Base Sepolia `0x82300bd7c3958625581cc2f77bc6464dcecdf3e5`, Arc `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1`),
   later `setForwarderAddress` to the production KeystoneForwarder (Base Sepolia `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`,
   Arc `0x76c9cf548b4179F8901cda1f8623568b58215E62`). Re-check addresses in the docs before use.
   ```bash
   export FORWARDER=... ORACLE=<EnergyOracle> CHAIN_SELECTOR=3034092155422581607   # Arc; Base Sepolia: 10344971235874465080
   export METER_ID=0x3d3fd68e62fe55c5ace7e50c015bf9462f804a23aa7b08589932f304186e8ab6
   export METER_SIGNER=<address of cre/mock-meter .env key> CONSUMER=<consumer> SUPPLIER_ID=<id>
   export POLICY_HASH=0xb7ac31c3a7df955e9c91398a82e7d17dfa24e72fa368175c91977ef889e9f266 DEPLOYER=<your address>
   forge script foundry/script/DeployReceiver.s.sol --rpc-url <chain rpc> --broadcast --account <keystore>
   ```
   Every Base Sepolia receiver needs its own DES system on that chain (`ORACLE` must exist there).
3. Register the receiver as oracle provider (USER-ONLY, caller needs `REGISTER_MANAGER_ROLE`):
   `cast send <Register> "registerOracleProvider(address)" <receiver> --rpc-url <chain rpc> --account <keystore>`
4. Register supplier, producer and consumer (`registerSupplier`, `registerProducer`, `registerElectricityConsumer`,
   see `foundry/script/DemoArc.s.sol`), then seed production NRGCT (USER-ONLY). The supplier needs enough NRGCT or reports
   revert. Each 1500 Wh reading burns 1500 NRGCT, so seed generously:
   `cast send <EnergyOracle> "recordEnergyProductions(uint256,uint256)" <producerId> 100000 --rpc-url <chain rpc> --account <keystore>`
   (caller must hold the oracle provider NFT).
5. Put the real `receiverAddress`, `consumer`, `supplierId` into `des-reading/config.base.json` / `config.arc.json`.
   Start the meter with a matching `CONSUMER`, `SUPPLIER_ID`, `METER_ID`.
6. Live simulation that writes a real transaction (USER-ONLY, spends gas from `CRE_ETH_PRIVATE_KEY` in `cre/.env`, never
   commit it):
   ```bash
   cd cre
   cre workflow simulate des-reading --target staging-base --non-interactive --trigger-index 0 --broadcast
   cre workflow simulate des-reading --target staging-arc  --non-interactive --trigger-index 0 --broadcast
   ```
   Run it once per minute boundary. A reading older than 600 s is rejected forever (readings are immutable), so reset
   `readings.json` if a sequence stalls.
7. Deploying the workflow to the CRE registry (`cre workflow deploy`) is also USER-ONLY and needs deploy access.

Tariff factors are placeholder contractual parameters, not EN 50160 or IEC compliance values.
