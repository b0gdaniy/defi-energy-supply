// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";

import { DesDeployer } from "./DesDeployer.sol";

/// @notice Deploys the DES system on a testnet (Arc Testnet or Base Sepolia). Env: USDC, DEPLOYER.
contract DeployDesTestnet is Script, DesDeployer {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 internal constant FEE_AMOUNT = 10;

    function run() external returns (System memory s) {
        require(
            block.chainid == ARC_TESTNET_CHAIN_ID || block.chainid == BASE_SEPOLIA_CHAIN_ID,
            "DeployDesTestnet: not Arc Testnet (5042002) or Base Sepolia (84532)"
        );
        address usdc = vm.envAddress("USDC");
        address deployer = vm.envAddress("DEPLOYER");

        vm.startBroadcast(deployer);
        s = _deployDes(usdc, deployer, FEE_AMOUNT);
        vm.stopBroadcast();

        console.log("Main:", address(s.main));
        console.log("Register:", address(s.register));
        console.log("EnergyOracle:", address(s.oracle));
        console.log("Escrow:", address(s.escrow));
        console.log("StakingReward:", address(s.staking));
        console.log("NRGCT:", address(s.nrgct));
        console.log("MGT:", address(s.mgt));
        console.log("NRGPT:", address(s.nrgpt));
        console.log("NRGST:", address(s.nrgst));
        console.log("NRGOPT:", address(s.nrgopt));
        console.log("ELCT:", address(s.elct));
    }
}
