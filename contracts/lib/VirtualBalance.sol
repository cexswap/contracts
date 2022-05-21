// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./SafeCast.sol";

library VirtualBalance {
  using SafeCast for uint256;
  using SafeMath for uint256;

  struct Data {
    uint216 balance;
    uint40 time;
  }

  function set(VirtualBalance.Data storage self, uint256 balance) internal {
    (self.balance, self.time) = (
      balance.toUint216(),
      block.timestamp.toUint40()
    );
  }

  function update(VirtualBalance.Data storage self, uint256 decayPeriod, uint256 realBalance) internal {
    set(self, current(self, decayPeriod, realBalance));
  }

  function scale(VirtualBalance.Data storage self, uint256 decayPeriod, uint256 realBalance, uint256 num, uint256 denom) internal {
    set(self, current(self, decayPeriod, realBalance).mul(num).add(denom.sub(1)).div(denom));
  }

  function current(VirtualBalance.Data memory self, uint256 decayPeriod, uint256 realBalance) 
    internal 
    view
    returns(uint256)
  {
    uint256 timePassed = Math.min(decayPeriod, block.timestamp.sub(self.time));
    uint256 timeRemain = decayPeriod.sub(timePassed);
    return uint256(self.balance).mul(timeRemain).add(
      realBalance.mul(timePassed)
    ).div(decayPeriod);
  }
}