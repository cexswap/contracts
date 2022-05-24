// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IFeeCollector {
  
  /** Adds specified `amount` as reward to `receiver` */
  function updateReward(address receiver, uint256 amount) external;

  function updateRewards(address[] calldata receivers, uint256[] calldata amounts) external;
}