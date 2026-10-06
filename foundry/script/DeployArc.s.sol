// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";

import { DesDeployer } from "./DesDeployer.sol";

contract DeployArc is Script, DesDeployer {
    uint256 internal constant ARC_MAINNET_CHAIN_ID = 5042;
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    uint256 internal constant FEE_AMOUNT = 10;

    function run() external returns (System memory s) {
        require(block.chainid == ARC_MAINNET_CHAIN_ID, "DeployArc: not Arc mainnet (5042)");
        address deployer = vm.envAddress("DEPLOYER");

        vm.startBroadcast(deployer);
        s = _deployDes(ARC_USDC, deployer, FEE_AMOUNT);
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
