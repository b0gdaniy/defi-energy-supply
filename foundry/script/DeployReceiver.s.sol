// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";

import { DESReadingReceiver, IEnergyOracle } from "../../contracts/cre/DESReadingReceiver.sol";

/// @notice Deploys DESReadingReceiver on Arc Testnet or Base Sepolia.
/// Env: FORWARDER, ORACLE, CHAIN_SELECTOR, METER_ID, METER_SIGNER, CONSUMER, SUPPLIER_ID, POLICY_HASH, DEPLOYER.
/// @dev After deployment, the Register manager must call registerOracleProvider(receiver),
/// otherwise the receiver cannot record readings in EnergyOracle.
contract DeployReceiver is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    function run() external returns (DESReadingReceiver receiver) {
        require(
            block.chainid == ARC_TESTNET_CHAIN_ID || block.chainid == BASE_SEPOLIA_CHAIN_ID,
            "DeployReceiver: not Arc Testnet (5042002) or Base Sepolia (84532)"
        );
        address deployer = vm.envAddress("DEPLOYER");

        vm.startBroadcast(deployer);
        receiver = new DESReadingReceiver(
            vm.envAddress("FORWARDER"),
            IEnergyOracle(vm.envAddress("ORACLE")),
            uint64(vm.envUint("CHAIN_SELECTOR")),
            vm.envBytes32("METER_ID"),
            vm.envAddress("METER_SIGNER"),
            vm.envAddress("CONSUMER"),
            vm.envUint("SUPPLIER_ID"),
            vm.envBytes32("POLICY_HASH")
        );
        vm.stopBroadcast();

        console.log("DESReadingReceiver:", address(receiver));
        console.log("Next: Register manager calls registerOracleProvider(receiver)");
    }
}
