// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Vendored from Chainlink CRE docs (building consumer contracts):
// https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts
// Docs dated 2026-05-08. Adaptation: the IERC165 import path points to OpenZeppelin 4.8.3.

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title IReceiver - receives keystone reports
/// @notice Implementations must support the IReceiver interface through ERC165.
interface IReceiver is IERC165 {
  /// @notice Handles incoming keystone reports.
  /// @dev If this function call reverts, it can be retried with a higher gas
  /// limit. The receiver is responsible for discarding stale reports.
  /// @param metadata Report's metadata.
  /// @param report Workflow report.
  function onReport(
    bytes calldata metadata,
    bytes calldata report
  ) external;
}
