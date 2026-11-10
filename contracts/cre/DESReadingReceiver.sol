// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { ReceiverTemplate } from "./ReceiverTemplate.sol";

/// @notice Minimal EnergyOracle surface used by the receiver
interface IEnergyOracle {
    function recordSupplierPrice(uint256 supplierId, uint256 supplierPrice) external;

    function recordConsumerConsumptions(address consumer, uint256 supplierId, uint256 consumption) external;

    function supplierEnergyPrice(uint256 supplierId) external view returns (uint256);

    function debtsUSD(address consumer, uint256 supplierId) external view returns (uint256);
}

/// @title DESReadingReceiver
/// @notice Chainlink CRE receiver that turns a signed meter reading into a tariff-priced consumption record
/// @dev The report is `abi.encode(Reading reading, bytes signature)`. The signature is an EIP-712 signature by
/// `meterSigner` over the Reading. This contract must hold the NRGOPT oracle provider token (see Register).
///
/// Known side effects: each report mints MGT to this receiver three times (two `recordSupplierPrice` calls and
/// one `recordConsumerConsumptions` call) and emits two `EnergyPriceRecorded` events. The supplier must hold enough NRGCT,
/// otherwise the report reverts.
///
/// Tariff factors below are placeholder contractual parameters. They are NOT EN 50160 or IEC compliance values.
contract DESReadingReceiver is ReceiverTemplate, EIP712, IERC721Receiver {
    /// @notice Signed meter reading
    struct Reading {
        uint64 chainSelector;
        bytes32 meterId;
        address consumer;
        uint256 supplierId;
        uint64 sequence;
        uint64 periodStart;
        uint64 periodEnd;
        uint256 energyWh;
        uint16 thdBps;
        uint16 pfBps;
        bytes32 policyHash;
    }

    bytes32 public constant READING_TYPEHASH = keccak256(
        "Reading(uint64 chainSelector,bytes32 meterId,address consumer,uint256 supplierId,uint64 sequence,uint64 periodStart,uint64 periodEnd,uint256 energyWh,uint16 thdBps,uint16 pfBps,bytes32 policyHash)"
    );

    /// @notice Base price, USDC base units per Wh
    uint256 public constant BASE_PRICE_PER_WH = 120;
    /// @notice Placeholder THD threshold in basis points (not a compliance value)
    uint256 public constant THD_LIMIT_BPS = 800;
    /// @notice Placeholder power factor floor in basis points (not a compliance value)
    uint256 public constant PF_MIN_BPS = 9_500;
    /// @notice Placeholder discount factor applied when THD exceeds the limit (90.00%)
    uint256 public constant THD_DISCOUNT_BPS = 9_000;
    /// @notice Placeholder surcharge factor applied when PF is below the floor (105.00%)
    uint256 public constant PF_SURCHARGE_BPS = 10_500;
    /// @notice Maximum energy per reading in Wh
    uint256 public constant MAX_ENERGY_WH = 10_000;
    /// @notice Maximum age of a reading period end, in seconds
    uint256 public constant MAX_READING_AGE = 600;
    /// @notice Maximum tolerated future period end, in seconds
    uint256 public constant MAX_CLOCK_SKEW = 30;

    IEnergyOracle public immutable oracle;
    uint64 public immutable chainSelector;
    bytes32 public immutable meterId;
    address public immutable meterSigner;
    address public immutable consumer;
    uint256 public immutable supplierId;
    bytes32 public immutable policyHash;

    /// @notice Next accepted reading sequence
    uint64 public nextSequence = 1;
    /// @notice End of the last accepted reading period
    uint64 public lastPeriodEnd;

    error WrongChainSelector(uint64 got, uint64 expected);
    error WrongMeterId(bytes32 got, bytes32 expected);
    error WrongConsumer(address got, address expected);
    error WrongSupplierId(uint256 got, uint256 expected);
    error WrongPolicyHash(bytes32 got, bytes32 expected);
    error WrongSequence(uint64 got, uint64 expected);
    error InvalidPeriod(uint64 periodStart, uint64 periodEnd);
    error PeriodOverlap(uint64 periodStart, uint64 lastPeriodEnd);
    error PeriodInFuture(uint64 periodEnd, uint256 blockTimestamp);
    error ReadingTooOld(uint64 periodEnd, uint256 blockTimestamp);
    error EnergyOutOfRange(uint256 energyWh);
    error BpsOutOfRange(uint16 value);
    error InvalidSignature();
    error ZeroAddress();

    event ReadingSettled(
        bytes32 indexed meterId,
        uint64 indexed sequence,
        bytes32 digest,
        uint64 periodStart,
        uint64 periodEnd,
        uint256 energyWh,
        uint16 thdBps,
        uint16 pfBps,
        uint256 pricePerWh,
        uint256 debtIncrement,
        bytes32 policyHash
    );

    constructor(
        address forwarder_,
        IEnergyOracle oracle_,
        uint64 chainSelector_,
        bytes32 meterId_,
        address meterSigner_,
        address consumer_,
        uint256 supplierId_,
        bytes32 policyHash_
    ) ReceiverTemplate(forwarder_) EIP712("DESReadingReceiver", "1") {
        if (address(oracle_) == address(0) || meterSigner_ == address(0) || consumer_ == address(0)) {
            revert ZeroAddress();
        }
        oracle = oracle_;
        chainSelector = chainSelector_;
        meterId = meterId_;
        meterSigner = meterSigner_;
        consumer = consumer_;
        supplierId = supplierId_;
        policyHash = policyHash_;
    }

    /// @notice Tariff price and amount for a reading
    /// @dev Rounding order: THD discount first, then PF surcharge, each with integer division.
    /// @param energyWh Energy in Wh
    /// @param thdBps Total harmonic distortion in basis points
    /// @param pfBps Power factor in basis points
    /// @return pricePerWh USDC base units per Wh
    /// @return amount energyWh * pricePerWh
    function quote(
        uint256 energyWh,
        uint16 thdBps,
        uint16 pfBps
    ) public pure returns (uint256 pricePerWh, uint256 amount) {
        pricePerWh = BASE_PRICE_PER_WH;
        if (thdBps > THD_LIMIT_BPS) pricePerWh = (pricePerWh * THD_DISCOUNT_BPS) / 10_000;
        if (pfBps < PF_MIN_BPS) pricePerWh = (pricePerWh * PF_SURCHARGE_BPS) / 10_000;
        amount = energyWh * pricePerWh;
    }

    /// @notice EIP-712 digest of a reading
    function readingDigest(Reading calldata r) public view returns (bytes32) {
        return _digest(r);
    }

    function _digest(Reading memory r) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    READING_TYPEHASH,
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
            )
        );
    }

    function _validate(Reading memory r) internal view {
        if (r.chainSelector != chainSelector) revert WrongChainSelector(r.chainSelector, chainSelector);
        if (r.meterId != meterId) revert WrongMeterId(r.meterId, meterId);
        if (r.consumer != consumer) revert WrongConsumer(r.consumer, consumer);
        if (r.supplierId != supplierId) revert WrongSupplierId(r.supplierId, supplierId);
        if (r.policyHash != policyHash) revert WrongPolicyHash(r.policyHash, policyHash);
        if (r.sequence != nextSequence) revert WrongSequence(r.sequence, nextSequence);
        if (r.periodStart >= r.periodEnd) revert InvalidPeriod(r.periodStart, r.periodEnd);
        if (r.periodStart < lastPeriodEnd) revert PeriodOverlap(r.periodStart, lastPeriodEnd);
        if (r.periodEnd > block.timestamp + MAX_CLOCK_SKEW) revert PeriodInFuture(r.periodEnd, block.timestamp);
        if (r.periodEnd < block.timestamp && block.timestamp - r.periodEnd > MAX_READING_AGE) {
            revert ReadingTooOld(r.periodEnd, block.timestamp);
        }
        if (r.energyWh == 0 || r.energyWh > MAX_ENERGY_WH) revert EnergyOutOfRange(r.energyWh);
        if (r.thdBps > 10_000) revert BpsOutOfRange(r.thdBps);
        if (r.pfBps > 10_000) revert BpsOutOfRange(r.pfBps);
    }

    function _processReport(bytes calldata report) internal override {
        (Reading memory r, bytes memory signature) = abi.decode(report, (Reading, bytes));
        _validate(r);

        bytes32 digest = _digest(r);
        (address signer, ECDSA.RecoverError err) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != meterSigner) revert InvalidSignature();

        nextSequence++;
        lastPeriodEnd = r.periodEnd;

        _settle(r, digest);
    }

    function _settle(Reading memory r, bytes32 digest) internal {
        (uint256 price, ) = quote(r.energyWh, r.thdBps, r.pfBps);
        uint256 prev = oracle.supplierEnergyPrice(supplierId);
        uint256 debtBefore = oracle.debtsUSD(consumer, supplierId);
        oracle.recordSupplierPrice(supplierId, price);
        oracle.recordConsumerConsumptions(consumer, supplierId, r.energyWh);
        oracle.recordSupplierPrice(supplierId, prev);

        emit ReadingSettled(
            r.meterId,
            r.sequence,
            digest,
            r.periodStart,
            r.periodEnd,
            r.energyWh,
            r.thdBps,
            r.pfBps,
            price,
            oracle.debtsUSD(consumer, supplierId) - debtBefore,
            r.policyHash
        );
    }

    /// @inheritdoc IERC721Receiver
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
