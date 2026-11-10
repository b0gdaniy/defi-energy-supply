// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";

import { DESReadingReceiver, IEnergyOracle } from "../../contracts/cre/DESReadingReceiver.sol";

/// @notice Cross-language vector: the constants below come from cre/scripts/digest-vector.ts (viem).
/// If this test fails, TS EIP-712 hashing, signing or abi encoding differs from Solidity.
contract DESReadingDigestVectorTest is Test {
    address internal constant RECEIVER = 0x00000000000000000000000000000000000d3516;
    bytes32 internal constant TS_DIGEST = 0x0b49f5e3d6d7a72de2ccbf6815846f5bdb866be588ed5591b1a399b426bd6f05;
    bytes internal constant TS_SIGNATURE =
        hex"55e3ea7d9785862da922e34ebf23948dce2a7c7ef1ca4d197f0a04fd4780ac8b7f1aeb1341397065403dac8030675d606960984800dc25decd3e5dc44b46b9f61c";
    bytes internal constant TS_REPORT =
        hex"0000000000000000000000000000000000000000000000008f90b8876dee65381111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000dead00000000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000006553f100000000000000000000000000000000000000000000000000000000006553f13c00000000000000000000000000000000000000000000000000000000000005dc00000000000000000000000000000000000000000000000000000000000004b00000000000000000000000000000000000000000000000000000000000002328b7ac31c3a7df955e9c91398a82e7d17dfa24e72fa368175c91977ef889e9f2660000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000004155e3ea7d9785862da922e34ebf23948dce2a7c7ef1ca4d197f0a04fd4780ac8b7f1aeb1341397065403dac8030675d606960984800dc25decd3e5dc44b46b9f61c00000000000000000000000000000000000000000000000000000000000000";

    DESReadingReceiver internal receiver;
    DESReadingReceiver.Reading internal r;

    function setUp() public {
        vm.chainId(31337);
        deployCodeTo(
            "DESReadingReceiver.sol:DESReadingReceiver",
            abi.encode(
                address(0xF0), // forwarder
                IEnergyOracle(address(0xA1)), // oracle, unused by digest/encoding
                uint64(10344971235874465080),
                bytes32(hex"1111111111111111111111111111111111111111111111111111111111111111"),
                address(0xBEEF), // meterSigner, unused here
                address(0xdEaD),
                uint256(7),
                bytes32(0xb7ac31c3a7df955e9c91398a82e7d17dfa24e72fa368175c91977ef889e9f266)
            ),
            RECEIVER
        );
        receiver = DESReadingReceiver(RECEIVER);
        r = DESReadingReceiver.Reading({
            chainSelector: 10344971235874465080,
            meterId: bytes32(hex"1111111111111111111111111111111111111111111111111111111111111111"),
            consumer: address(0xdEaD),
            supplierId: 7,
            sequence: 3,
            periodStart: 1_700_000_000,
            periodEnd: 1_700_000_060,
            energyWh: 1500,
            thdBps: 1200,
            pfBps: 9000,
            policyHash: 0xb7ac31c3a7df955e9c91398a82e7d17dfa24e72fa368175c91977ef889e9f266
        });
    }

    function test_digestMatchesViem() public view {
        assertEq(receiver.readingDigest(r), TS_DIGEST);
    }

    function test_signatureMatchesViem() public pure {
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(1, TS_DIGEST);
        assertEq(abi.encodePacked(rr, ss, v), TS_SIGNATURE);
    }

    function test_reportEncodingMatchesViem() public view {
        assertEq(abi.encode(r, TS_SIGNATURE), TS_REPORT);
    }
}
