// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";

import { DesDeployer } from "../script/DesDeployer.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { OnlyEnergyOracleProvider } from "../../contracts/EnergyOracle.sol";
import { TokenNotWhitelisted } from "../../contracts/Escrow.sol";

contract DesArcTest is Test, DesDeployer {
    MockUSDC internal usdc;
    System internal s;

    address internal oracle = makeAddr("oracle");
    address internal supplier = makeAddr("supplier");
    address internal consumer = makeAddr("consumer");
    address internal feeReceiver = makeAddr("feeReceiver");

    uint256 internal constant FEE = 10;
    uint256 internal constant PRICE_PER_WH = 120;
    uint256 internal supplierId;
    uint256 internal producerId;

    function setUp() public {
        usdc = new MockUSDC();
        s = _deployDes(address(usdc), feeReceiver, FEE);

        s.register.registerOracleProvider(oracle);
        supplierId = s.register.currentSupplierId();
        s.register.registerSupplier(supplier);
        producerId = s.register.currentProducerId();
        s.register.registerProducer(supplier);

        vm.prank(supplier);
        s.register.registerElectricityConsumer(consumer, supplierId);

        usdc.mint(consumer, 100e6);
        vm.prank(consumer);
        usdc.approve(address(s.escrow), type(uint256).max);
    }

    function _produce(uint256 wh) internal {
        vm.prank(oracle);
        s.oracle.recordEnergyProductions(producerId, wh);
    }

    function _price(uint256 price) internal {
        vm.prank(oracle);
        s.oracle.recordSupplierPrice(supplierId, price);
    }

    function _consume(uint256 wh) internal {
        vm.prank(oracle);
        s.oracle.recordConsumerConsumptions(consumer, supplierId, wh);
    }

    function _pay() internal {
        vm.prank(consumer);
        s.escrow.payForElectricity(supplierId, address(usdc));
    }

    function test_wiring_mainUsesUsdcForAllStablecoinSlots() public view {
        assertEq(s.main.USDC(), address(usdc));
        assertEq(s.main.DAI(), address(usdc));
        assertEq(s.main.USDT(), address(usdc));
        assertEq(address(s.main.contracts().oracle), address(s.oracle));
        assertEq(address(s.main.contracts().escrow), address(s.escrow));
        assertTrue(s.oracle.hasRole(address(s.escrow), s.oracle.ESCROW()));
    }

    function test_flow_readingThenPayment_settlesInUsdc() public {
        _produce(10_000);
        _price(PRICE_PER_WH);
        _consume(1_500);

        assertEq(s.oracle.debtsUSD(consumer, supplierId), 180_000);
        assertEq(s.nrgct.balanceOf(supplier), 8_500);

        _pay();

        assertEq(usdc.balanceOf(supplier), 180_000);
        assertEq(usdc.balanceOf(feeReceiver), FEE);
        assertEq(usdc.balanceOf(consumer), 100e6 - 180_000 - FEE);
        assertEq(usdc.balanceOf(address(s.escrow)), 0);
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 0);
    }

    function test_flow_oracleSidePriceUpdate_appliesToNextReading() public {
        _produce(10_000);
        _price(PRICE_PER_WH);
        _consume(1_000);
        _price(108);
        _consume(1_000);
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 120_000 + 108_000);
    }

    function test_flow_paymentWithZeroDebt_paysOnlyFee() public {
        _pay();
        assertEq(usdc.balanceOf(supplier), 0);
        assertEq(usdc.balanceOf(feeReceiver), FEE);
    }

    function test_onlyOracleProviderRecords() public {
        vm.expectRevert(OnlyEnergyOracleProvider.selector);
        s.oracle.recordConsumerConsumptions(consumer, supplierId, 1);
    }

    function test_payment_rejectsNonWhitelistedToken() public {
        MockUSDC other = new MockUSDC();
        vm.prank(consumer);
        vm.expectRevert(abi.encodeWithSelector(TokenNotWhitelisted.selector, address(other)));
        s.escrow.payForElectricity(supplierId, address(other));
    }

    function test_payment_revertsWhenSupplierBlocklisted() public {
        _produce(10_000);
        _price(PRICE_PER_WH);
        _consume(1_500);
        usdc.setBlocked(supplier, true);
        vm.prank(consumer);
        vm.expectRevert();
        s.escrow.payForElectricity(supplierId, address(usdc));
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 180_000);
    }

    function test_limitation_consumptionRevertsWithoutSupplierCredits() public {
        _price(PRICE_PER_WH);
        vm.prank(oracle);
        vm.expectRevert();
        s.oracle.recordConsumerConsumptions(consumer, supplierId, 1_500);
    }

    function test_limitation_sameReadingCanBeRecordedTwice() public {
        _produce(10_000);
        _price(PRICE_PER_WH);
        _consume(1_500);
        _consume(1_500);
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 360_000);
    }

    function testFuzz_debtAndPaymentConserveUsdc(uint256 wh, uint256 price) public {
        wh = bound(wh, 1, 1_000_000);
        price = bound(price, 1, 10_000);
        _produce(wh);
        _price(price);
        _consume(wh);

        uint256 debt = wh * price;
        assertEq(s.oracle.debtsUSD(consumer, supplierId), debt);

        usdc.mint(consumer, debt + FEE);
        uint256 before = usdc.balanceOf(consumer);
        _pay();
        assertEq(before - usdc.balanceOf(consumer), debt + FEE);
        assertEq(usdc.balanceOf(supplier), debt);
        assertEq(usdc.balanceOf(address(s.escrow)), 0);
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 0);
    }
}
