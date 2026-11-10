# DES Tariff Policy v1

Status: placeholder contractual parameters for the DES demo. This is NOT a compliance rule. It does not implement or claim conformance with EN 50160, IEC 61000 or any other power quality standard.

## Units

- Energy: Wh. 1 NRGCT = 1 Wh.
- Price: USDC base units per Wh (USDC has 6 decimals).
- Ratios: basis points (bps), 10_000 bps = 100%.

## Rule

1. Base price: 120 USDC base units per Wh.
2. THD rule: if THD is greater than 800 bps, the price is multiplied by 9_000 / 10_000 (discount to 90%).
3. Power factor rule: if PF is lower than 9_500 bps, the price is multiplied by 10_500 / 10_000 (surcharge to 105%).
4. Rounding order: apply rule 2 first, with integer division (round down), then rule 3 on the result, with integer division (round down).
5. Amount = energyWh * price per Wh.

Resulting prices: normal 120, high THD only 108, low PF only 126, both 113.

## Reading limits

- Energy per reading: greater than 0 and at most 10_000 Wh.
- THD and PF: at most 10_000 bps.
- Reading period end must be at most 30 s in the future and at most 600 s in the past.

## Policy hash

`policyHash` is the keccak256 of this file, computed from the repository root:

```
cast keccak "$(cat docs/cre/TariffPolicy-v1.md)"
```

Any edit to this file changes the hash, so a changed policy needs a new receiver deployment.
