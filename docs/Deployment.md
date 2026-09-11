# Live Deployment

The **Energy Billing Automation System** is fully deployed and operational on the
**Base Sepolia** testnet.

## Quick Links

| Resource                  | Link                                                                              |
| ------------------------- | --------------------------------------------------------------------------------- |
| Documentation (GitBook)   | https://b0gdaniy.gitbook.io/defi-energy-supply/                                   |
| Source code (contracts)   | https://github.com/passat-b6-tdi/defi-energy-supply                               |
| Source code (subgraph)    | https://github.com/passat-b6-tdi/defi-energy-supply-subgraph                      |
| GraphQL playground        | https://api.studio.thegraph.com/query/59239/defi-energy-supply-base-sepolia/version/latest/ |
| Monitoring dashboard (Grafana, IP) | [https://13.62.49.115.sslip.io](https://13.62.49.115.sslip.io/d/energy-dashboard/energy-metrics-dashboard?orgId=1&from=now-6h&to=now&timezone=browser&refresh=10s)                                            |
| Monitoring dashboard (Grafana, tunnel) | [https://respected-pieces-barrel-transform.trycloudflare.com](https://respected-pieces-barrel-transform.trycloudflare.com/d/energy-dashboard/energy-metrics-dashboard?orgId=1&from=now-6h&to=now&timezone=browser&refresh=10s)          |

## Smart Contracts (Base Sepolia)

### Core

| Contract     | Address                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Main         | [0x8ff2093Bb6B358214EF950bCe9AEB486EDadA40A](https://sepolia.basescan.org/address/0x8ff2093Bb6B358214EF950bCe9AEB486EDadA40A) |
| Register     | [0x6A7a5178299f3257d7f35343719F6C577dE4A0f3](https://sepolia.basescan.org/address/0x6A7a5178299f3257d7f35343719F6C577dE4A0f3) |
| Escrow       | [0x55f5662efffb06418DB2b36e98cd53B86BC7D466](https://sepolia.basescan.org/address/0x55f5662efffb06418DB2b36e98cd53B86BC7D466) |
| EnergyOracle | [0xb7a26DC03a9BB0d31b8770e4Fb88027AD705Ba06](https://sepolia.basescan.org/address/0xb7a26DC03a9BB0d31b8770e4Fb88027AD705Ba06) |
| StakingReward | [0xEf12a92cb95c15A5FC422b9d3Ba64E360C2ED1c8](https://sepolia.basescan.org/address/0xEf12a92cb95c15A5FC422b9d3Ba64E360C2ED1c8) |

### Tokens

| Token                      | Symbol | Address                                                                                                                |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Microgrid Governance Token   | MGT    | [0x669F43B25f42Cd2CB3E490d9DE3684F5CE768C73](https://sepolia.basescan.org/address/0x669F43B25f42Cd2CB3E490d9DE3684F5CE768C73) |
| Energy Producer Token        | NRGPT  | [0xd18BCf2C6169165D374c782790a2831237ADbde6](https://sepolia.basescan.org/address/0xd18BCf2C6169165D374c782790a2831237ADbde6) |
| Energy Credit Token          | NRGCT  | [0xb2Ebf583b75723bAe5B6F6Dc6613eC252f66Fd94](https://sepolia.basescan.org/address/0xb2Ebf583b75723bAe5B6F6Dc6613eC252f66Fd94) |
| Energy Supplier Token        | NRGST  | [0xffF664489fa997f6Ec6147fe8D6d459d4C5607dC](https://sepolia.basescan.org/address/0xffF664489fa997f6Ec6147fe8D6d459d4C5607dC) |
| Energy Oracle Provider Token | NRGOPT | [0x36B60AA01B880253EA97f44e5b75070F9caD1DBe](https://sepolia.basescan.org/address/0x36B60AA01B880253EA97f44e5b75070F9caD1DBe) |
| Electricity Consumer Token   | ELCT   | [0x2EDF0D97D70fe186C9A283681cbA8C8F6707AFBB](https://sepolia.basescan.org/address/0x2EDF0D97D70fe186C9A283681cbA8C8F6707AFBB) |

### Mock Stablecoins (for testing)

| Token | Address                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------- |
| USDC  | [0xE7dd5A4D81Be2b511EA958934e02c216c6C7Ec38](https://sepolia.basescan.org/address/0xE7dd5A4D81Be2b511EA958934e02c216c6C7Ec38) |
| DAI   | [0x875A66DC00c190416c11ee387daF7d65f0474050](https://sepolia.basescan.org/address/0x875A66DC00c190416c11ee387daF7d65f0474050) |
| USDT  | [0x3d1f856a1258FEcd940aCD46b3DF3dCD935b4792](https://sepolia.basescan.org/address/0x3d1f856a1258FEcd940aCD46b3DF3dCD935b4792) |

## Try the Subgraph

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
