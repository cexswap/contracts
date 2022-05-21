// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IReferralFeeReceiver {
  function updateReward(address referral, uint256 referralShare) external;
}