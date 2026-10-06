// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Main } from "../../contracts/Main.sol";

contract DemoArc is Script {
    uint256 internal constant BASE_PRICE_PER_WH = 120;
    uint256 internal constant PRODUCTION_WH = 10_000;

    struct Reading {
        uint256 energyWh;
        uint16 thdBps;
        uint16 pfBps;
    }

    function _qualityPrice(Reading memory r) internal pure returns (uint256 price) {
        price = BASE_PRICE_PER_WH;
        if (r.thdBps > 800) price = (price * 9_000) / 10_000;
        if (r.pfBps < 9_500) price = (price * 10_500) / 10_000;
    }

    function run() external {
        Main main_ = Main(vm.envAddress("MAIN"));
        uint256 ownerPk = vm.envUint("PRIVATE_KEY");
        uint256 supplierPk = vm.envUint("SUPPLIER_PRIVATE_KEY");
        uint256 consumerPk = vm.envUint("CONSUMER_PRIVATE_KEY");
        address owner = vm.addr(ownerPk);
        address supplier = vm.addr(supplierPk);
        address consumer = vm.addr(consumerPk);

        Main.Tokens memory t = main_.tokens();
        Main.Contracts memory c = main_.contracts();
        IERC20 usdc = IERC20(main_.USDC());

        require(c.register.currentSupplierId() == 1, "DemoArc: expects a fresh deployment");
        uint256 supplierId = c.register.currentSupplierId();
        uint256 producerId = c.register.currentProducerId();

        vm.startBroadcast(ownerPk);
        c.register.registerOracleProvider(owner);
        c.register.registerSupplier(supplier);
        c.register.registerProducer(supplier);
        vm.stopBroadcast();

        vm.startBroadcast(supplierPk);
        c.register.registerElectricityConsumer(consumer, supplierId);
        vm.stopBroadcast();

        vm.startBroadcast(ownerPk);
        c.oracle.recordEnergyProductions(producerId, PRODUCTION_WH);
        vm.stopBroadcast();

        Reading[5] memory readings = [
            Reading(1_500, 320, 9_800),
            Reading(2_100, 910, 9_700),
            Reading(1_800, 400, 9_100),
            Reading(2_400, 850, 9_200),
            Reading(1_200, 250, 9_900)
        ];

        uint256 fee = main_.fees().amount;
        for (uint256 i; i < readings.length; ++i) {
            vm.startBroadcast(ownerPk);
            c.oracle.recordSupplierPrice(supplierId, _qualityPrice(readings[i]));
            c.oracle.recordConsumerConsumptions(consumer, supplierId, readings[i].energyWh);
            vm.stopBroadcast();

            uint256 due = c.oracle.debtsUSD(consumer, supplierId) + fee;
            vm.startBroadcast(consumerPk);
            usdc.approve(address(c.escrow), due);
            c.escrow.payForElectricity(supplierId, address(usdc));
            vm.stopBroadcast();

            console.log("Reading", i + 1, "paid (USDC base units, incl. fee):", due);
        }

        console.log("Supplier USDC balance:", usdc.balanceOf(supplier));
        console.log("Supplier NRGCT left (Wh):", t.energyCreditToken.balanceOf(supplier));
        console.log("Consumer debt after demo:", c.oracle.debtsUSD(consumer, supplierId));
    }
}
