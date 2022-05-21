// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IGovernance {
  function updateStakeChanged(address account, uint256 newBalance) external;
  function updateStakesChanged(address[] calldata accounts, uint256[] calldata newBalances) external;
}