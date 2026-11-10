// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";

import { DesDeployer } from "../script/DesDeployer.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { DESReadingReceiver, IEnergyOracle } from "../../contracts/cre/DESReadingReceiver.sol";
import { IReceiver } from "../../contracts/cre/IReceiver.sol";
import { ReceiverTemplate } from "../../contracts/cre/ReceiverTemplate.sol";

contract DESReadingReceiverTest is Test, DesDeployer {
    MockUSDC internal usdc;
    System internal s;
    DESReadingReceiver internal receiver;

    address internal forwarder = makeAddr("forwarder");
    address internal producerOracle = makeAddr("producerOracle");
    address internal supplier = makeAddr("supplier");
    address internal consumer = makeAddr("consumer");
    address internal feeReceiver = makeAddr("feeReceiver");
    address internal meter;
    uint256 internal meterKey;

    uint256 internal constant FEE = 10;
    uint64 internal constant SELECTOR = 3478487238524512106;
    bytes32 internal constant METER_ID = keccak256("meter-1");
    bytes32 internal constant POLICY = keccak256("policy-v1");
    uint256 internal constant T0 = 1_700_000_000;

    uint256 internal supplierId;
    uint256 internal producerId;

    function setUp() public {
        vm.warp(T0);
        (meter, meterKey) = makeAddrAndKey("meter");

        usdc = new MockUSDC();
        s = _deployDes(address(usdc), feeReceiver, FEE);

        s.register.registerOracleProvider(producerOracle);
        supplierId = s.register.currentSupplierId();
        s.register.registerSupplier(supplier);
        producerId = s.register.currentProducerId();
        s.register.registerProducer(supplier);
        vm.prank(supplier);
        s.register.registerElectricityConsumer(consumer, supplierId);

        receiver = new DESReadingReceiver(
            forwarder,
            IEnergyOracle(address(s.oracle)),
            SELECTOR,
            METER_ID,
            meter,
            consumer,
            supplierId,
            POLICY
        );
        s.register.registerOracleProvider(address(receiver));

        usdc.mint(consumer, 100e6);
        vm.prank(consumer);
        usdc.approve(address(s.escrow), type(uint256).max);
    }

    // helpers

    function _produce(uint256 wh) internal {
        vm.prank(producerOracle);
        s.oracle.recordEnergyProductions(producerId, wh);
    }

    function _reading(
        uint64 seq,
        uint64 start,
        uint64 end,
        uint256 wh,
        uint16 thd,
        uint16 pf
    ) internal view returns (DESReadingReceiver.Reading memory r) {
        r = DESReadingReceiver.Reading({
            chainSelector: SELECTOR,
            meterId: METER_ID,
            consumer: consumer,
            supplierId: supplierId,
            sequence: seq,
            periodStart: start,
            periodEnd: end,
            energyWh: wh,
            thdBps: thd,
            pfBps: pf,
            policyHash: POLICY
        });
    }

    function _std(uint256 wh, uint16 thd, uint16 pf) internal view returns (DESReadingReceiver.Reading memory) {
        return _reading(1, uint64(T0 - 60), uint64(T0 - 10), wh, thd, pf);
    }

    function _payload(DESReadingReceiver.Reading memory r, uint256 key) internal view returns (bytes memory) {
        bytes32 digest = receiver.readingDigest(r);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(key, digest);
        return abi.encode(r, abi.encodePacked(rr, ss, v));
    }

    function _send(bytes memory payload) internal {
        vm.prank(forwarder);
        receiver.onReport("", payload);
    }

    function _submit(DESReadingReceiver.Reading memory r) internal {
        _send(_payload(r, meterKey));
    }

    function _expectRevertSubmit(DESReadingReceiver.Reading memory r, bytes memory err) internal {
        bytes memory payload = _payload(r, meterKey);
        vm.expectRevert(err);
        vm.prank(forwarder);
        receiver.onReport("", payload);
    }

    /// @dev Reference implementation of the DemoArc quality price rule
    function _refPrice(uint16 thd, uint16 pf) internal pure returns (uint256 price) {
        price = 120;
        if (thd > 800) price = (price * 9_000) / 10_000;
        if (pf < 9_500) price = (price * 10_500) / 10_000;
    }

    // registration and interface

    function test_registerOracleProvider_mintsNrgoptToReceiver() public view {
        assertEq(s.nrgopt.balanceOf(address(receiver)), 1);
    }

    function test_supportsInterface() public view {
        assertTrue(receiver.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(receiver.supportsInterface(0x01ffc9a7));
        assertFalse(receiver.supportsInterface(0xffffffff));
    }

    function test_domainSeparator() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("DESReadingReceiver"),
                keccak256("1"),
                block.chainid,
                address(receiver)
            )
        );
        DESReadingReceiver.Reading memory r = _std(1_000, 300, 9_800);
        bytes32 rh = keccak256(
            abi.encode(
                receiver.READING_TYPEHASH(),
                r.chainSelector,
                r.meterId,
                r.consumer,
                r.supplierId,
                r.sequence,
                r.periodStart,
                r.periodEnd,
                r.energyWh,
                r.thdBps,
                r.pfBps,
                r.policyHash
            )
        );
        assertEq(receiver.readingDigest(r), keccak256(abi.encodePacked("\x19\x01", expected, rh)));
    }

    // happy paths

    function test_normalReading() public {
        _produce(10_000);
        // price before is zero, must be restored to it
        assertEq(s.oracle.supplierEnergyPrice(supplierId), 0);
        _submit(_std(1_500, 300, 9_800));
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 1_500 * 120);
        assertEq(s.oracle.supplierEnergyPrice(supplierId), 0);
        assertEq(receiver.nextSequence(), 2);
        assertEq(receiver.lastPeriodEnd(), T0 - 10);
        assertEq(s.nrgct.balanceOf(supplier), 8_500);
    }

    function test_priceRestoredToPriorValue() public {
        _produce(10_000);
        vm.prank(address(receiver));
        s.oracle.recordSupplierPrice(supplierId, 77);
        _submit(_std(1_000, 300, 9_800));
        assertEq(s.oracle.supplierEnergyPrice(supplierId), 77);
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 120_000);
    }

    function test_highThd_discount() public {
        _produce(10_000);
        _submit(_std(1_000, 910, 9_800));
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 108_000);
    }

    function test_lowPf_surcharge() public {
        _produce(10_000);
        _submit(_std(1_000, 300, 9_100));
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 126_000);
    }

    function test_highThd_lowPf_combined() public {
        _produce(10_000);
        _submit(_std(1_000, 910, 9_100));
        // 120 * 9000 / 10000 = 108; 108 * 10500 / 10000 = 113 (rounded down)
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 113_000);
    }

    function test_thresholdsAreStrict() public {
        _produce(10_000);
        _submit(_std(1_000, 800, 9_500));
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 120_000);
    }

    function test_emitsReadingSettled() public {
        _produce(10_000);
        DESReadingReceiver.Reading memory r = _std(1_000, 910, 9_100);
        bytes32 digest = receiver.readingDigest(r);
        vm.expectEmit(true, true, false, true, address(receiver));
        emit DESReadingReceiver.ReadingSettled(
            METER_ID,
            1,
            digest,
            r.periodStart,
            r.periodEnd,
            1_000,
            910,
            9_100,
            113,
            113_000,
            POLICY
        );
        _submit(r);
    }

    function test_sequentialReadings() public {
        _produce(10_000);
        _submit(_reading(1, uint64(T0 - 60), uint64(T0 - 30), 1_000, 300, 9_800));
        _submit(_reading(2, uint64(T0 - 30), uint64(T0 - 5), 500, 300, 9_800));
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 180_000);
        assertEq(receiver.nextSequence(), 3);
    }

    function test_boundaryTimes() public {
        _produce(10_000);
        _submit(_reading(1, uint64(T0 - 700), uint64(T0 - 600), 100, 300, 9_800));
        _submit(_reading(2, uint64(T0 - 600), uint64(T0 + 30), 100, 300, 9_800));
    }

    // access control and replay

    function test_revert_nonForwarder() public {
        _produce(10_000);
        bytes memory payload = _payload(_std(1_000, 300, 9_800), meterKey);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), forwarder));
        receiver.onReport("", payload);
    }

    function test_revert_replaySameSequence() public {
        _produce(10_000);
        DESReadingReceiver.Reading memory r = _std(1_000, 300, 9_800);
        _submit(r);
        _expectRevertSubmit(r, abi.encodeWithSelector(DESReadingReceiver.WrongSequence.selector, 1, 2));
    }

    function test_revert_skippedSequence() public {
        _produce(10_000);
        _expectRevertSubmit(
            _reading(2, uint64(T0 - 60), uint64(T0 - 10), 1_000, 300, 9_800),
            abi.encodeWithSelector(DESReadingReceiver.WrongSequence.selector, 2, 1)
        );
    }

    // signature

    function test_revert_wrongKey() public {
        _produce(10_000);
        (, uint256 otherKey) = makeAddrAndKey("other");
        bytes memory payload = _payload(_std(1_000, 300, 9_800), otherKey);
        vm.expectRevert(DESReadingReceiver.InvalidSignature.selector);
        vm.prank(forwarder);
        receiver.onReport("", payload);
    }

    function test_revert_malformedSignature() public {
        _produce(10_000);
        bytes memory payload = abi.encode(_std(1_000, 300, 9_800), hex"deadbeef");
        vm.expectRevert(DESReadingReceiver.InvalidSignature.selector);
        vm.prank(forwarder);
        receiver.onReport("", payload);
    }

    function test_revert_signatureOverDifferentReading() public {
        _produce(10_000);
        DESReadingReceiver.Reading memory signed = _std(1_000, 300, 9_800);
        bytes memory good = _payload(signed, meterKey);
        (, bytes memory sig) = abi.decode(good, (DESReadingReceiver.Reading, bytes));
        DESReadingReceiver.Reading memory tampered = _std(2_000, 300, 9_800);
        bytes memory payload = abi.encode(tampered, sig);
        vm.expectRevert(DESReadingReceiver.InvalidSignature.selector);
        vm.prank(forwarder);
        receiver.onReport("", payload);
    }

    // binding fields

    function test_revert_wrongChainSelector() public {
        DESReadingReceiver.Reading memory r = _std(1_000, 300, 9_800);
        r.chainSelector = 1;
        _expectRevertSubmit(r, abi.encodeWithSelector(DESReadingReceiver.WrongChainSelector.selector, 1, SELECTOR));
    }

    function test_revert_wrongPolicyHash() public {
        DESReadingReceiver.Reading memory r = _std(1_000, 300, 9_800);
        r.policyHash = bytes32(uint256(1));
        _expectRevertSubmit(
            r,
            abi.encodeWithSelector(DESReadingReceiver.WrongPolicyHash.selector, bytes32(uint256(1)), POLICY)
        );
    }

    function test_revert_wrongMeterId() public {
        DESReadingReceiver.Reading memory r = _std(1_000, 300, 9_800);
        r.meterId = bytes32(uint256(2));
        _expectRevertSubmit(
            r,
            abi.encodeWithSelector(DESReadingReceiver.WrongMeterId.selector, bytes32(uint256(2)), METER_ID)
        );
    }

    function test_revert_wrongConsumer() public {
        DESReadingReceiver.Reading memory r = _std(1_000, 300, 9_800);
        r.consumer = address(0x1234);
        _expectRevertSubmit(
            r,
            abi.encodeWithSelector(DESReadingReceiver.WrongConsumer.selector, address(0x1234), consumer)
        );
    }

    function test_revert_wrongSupplierId() public {
        DESReadingReceiver.Reading memory r = _std(1_000, 300, 9_800);
        r.supplierId = supplierId + 1;
        _expectRevertSubmit(
            r,
            abi.encodeWithSelector(DESReadingReceiver.WrongSupplierId.selector, supplierId + 1, supplierId)
        );
    }

    // time and range

    function test_revert_stale() public {
        _expectRevertSubmit(
            _reading(1, uint64(T0 - 700), uint64(T0 - 601), 1_000, 300, 9_800),
            abi.encodeWithSelector(DESReadingReceiver.ReadingTooOld.selector, T0 - 601, T0)
        );
    }

    function test_revert_future() public {
        _expectRevertSubmit(
            _reading(1, uint64(T0), uint64(T0 + 31), 1_000, 300, 9_800),
            abi.encodeWithSelector(DESReadingReceiver.PeriodInFuture.selector, T0 + 31, T0)
        );
    }

    function test_revert_invalidPeriod() public {
        _expectRevertSubmit(
            _reading(1, uint64(T0 - 10), uint64(T0 - 10), 1_000, 300, 9_800),
            abi.encodeWithSelector(DESReadingReceiver.InvalidPeriod.selector, T0 - 10, T0 - 10)
        );
    }

    function test_revert_overlappingPeriod() public {
        _produce(10_000);
        _submit(_reading(1, uint64(T0 - 60), uint64(T0 - 10), 1_000, 300, 9_800));
        _expectRevertSubmit(
            _reading(2, uint64(T0 - 20), uint64(T0 - 5), 1_000, 300, 9_800),
            abi.encodeWithSelector(DESReadingReceiver.PeriodOverlap.selector, T0 - 20, T0 - 10)
        );
    }

    function test_revert_energyZero() public {
        _expectRevertSubmit(_std(0, 300, 9_800), abi.encodeWithSelector(DESReadingReceiver.EnergyOutOfRange.selector, 0));
    }

    function test_revert_energyAboveMax() public {
        _expectRevertSubmit(
            _std(10_001, 300, 9_800),
            abi.encodeWithSelector(DESReadingReceiver.EnergyOutOfRange.selector, 10_001)
        );
    }

    function test_energyAtMax() public {
        _produce(10_000);
        _submit(_std(10_000, 300, 9_800));
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 1_200_000);
    }

    function test_revert_thdAbove10000() public {
        _expectRevertSubmit(
            _std(1_000, 10_001, 9_800),
            abi.encodeWithSelector(DESReadingReceiver.BpsOutOfRange.selector, 10_001)
        );
    }

    function test_revert_pfAbove10000() public {
        _expectRevertSubmit(
            _std(1_000, 300, 10_001),
            abi.encodeWithSelector(DESReadingReceiver.BpsOutOfRange.selector, 10_001)
        );
    }

    // atomicity

    function test_revert_supplierWithoutCredits_stateUnchanged() public {
        _produce(500);
        bytes memory payload = _payload(_std(1_000, 300, 9_800), meterKey);
        vm.expectRevert();
        vm.prank(forwarder);
        receiver.onReport("", payload);
        assertEq(receiver.nextSequence(), 1);
        assertEq(receiver.lastPeriodEnd(), 0);
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 0);
        assertEq(s.oracle.supplierEnergyPrice(supplierId), 0);
    }

    // ERC721 receiver

    function test_onERC721Received_selector() public view {
        assertEq(receiver.onERC721Received(address(0), address(0), 0, ""), bytes4(0x150b7a02));
    }

    // end to end

    function test_endToEnd_reportThenPay() public {
        _produce(10_000);
        _submit(_std(1_500, 910, 9_100));
        uint256 debt = 1_500 * 113;
        assertEq(s.oracle.debtsUSD(consumer, supplierId), debt);

        vm.prank(consumer);
        s.escrow.payForElectricity(supplierId, address(usdc));

        assertEq(usdc.balanceOf(supplier), debt);
        assertEq(usdc.balanceOf(feeReceiver), FEE);
        assertEq(usdc.balanceOf(consumer), 100e6 - debt - FEE);
        assertEq(s.oracle.debtsUSD(consumer, supplierId), 0);
    }

    // fuzz

    function testFuzz_quoteMatchesReference(uint256 wh, uint16 thd, uint16 pf) public view {
        wh = bound(wh, 0, 1e30);
        (uint256 price, uint256 amount) = receiver.quote(wh, thd, pf);
        assertEq(price, _refPrice(thd, pf));
        assertEq(amount, wh * _refPrice(thd, pf));
    }

    function testFuzz_settledDebtMatchesQuote(uint256 wh, uint16 thd, uint16 pf) public {
        wh = bound(wh, 1, 10_000);
        thd = uint16(bound(thd, 0, 10_000));
        pf = uint16(bound(pf, 0, 10_000));
        _produce(10_000);
        _submit(_std(wh, thd, pf));
        assertEq(s.oracle.debtsUSD(consumer, supplierId), wh * _refPrice(thd, pf));
    }
}
