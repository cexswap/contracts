// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./Vote.sol";


library Voting {
  using SafeMath for uint256;
  using Vote for Vote.Data;

  struct Data {
    uint256 result;
    uint256 weightedSum;
    uint256 defaultVote;
    mapping(address => Vote.Data) votes;
  }

  function updateVote(
    Voting.Data storage self,
    address user,
    Vote.Data memory oldVote,
    Vote.Data memory newVote,
    uint256 balance,
    uint256 totalSupply,
    uint256 defaultVote,
    function(address, uint256, bool, uint256) emitEvent
  ) internal {
    return _update(self, user, oldVote, newVote, balance, balance, totalSupply, defaultVote, emitEvent);
  }

  function updateBalance(
    Voting.Data storage self,
    address user,
    Vote.Data memory oldVote,
    uint256 oldBalance,
    uint256 newBalance,
    uint256 newTotalSupply,
    uint256 defaultVote,
    function(address, uint256, bool, uint256) emitEvent
  ) internal {
    return _update(self, user, oldVote, newBalance == 0 ? Vote.init() : oldVote, oldBalance, newBalance, newTotalSupply, defaultVote, emitEvent);
  }

  function _update(
    Voting.Data storage self,
    address user,
    Vote.Data memory oldVote,
    Vote.Data memory newVote,
    uint256 oldBalance,
    uint256 newBalance,
    uint256 totalSupply,
    uint256 defaultVote,
    function(address, uint256, bool, uint256) emitEvent
  ) internal {
    uint256 oldWeightedSum = self.weightedSum;
    uint256 newWeightedSum = oldWeightedSum;
    uint256 oldDefaultVote = self.defaultVote;
    uint256 newDefaultVote = oldDefaultVote;

    if(oldVote.isDefault()) {
      newDefaultVote = newDefaultVote.sub(oldBalance);
    } else {
      newWeightedSum = newWeightedSum.sub(oldBalance.mul(oldVote.get(defaultVote)));
    }

    if(newVote.isDefault()) {
      newDefaultVote = newDefaultVote.add(oldBalance);
    } else {
      newWeightedSum = newWeightedSum.add(newBalance.mul(newVote.get(defaultVote)));
    }

    if(newWeightedSum != oldWeightedSum){
      self.weightedSum = newWeightedSum;
    }

    if(newDefaultVote != oldDefaultVote){
      self.defaultVote = newDefaultVote;
    }

    uint256 newResult = totalSupply == 0 ? defaultVote : newWeightedSum.add(newDefaultVote.mul(defaultVote)).div(totalSupply);
    if(newResult != self.result){
      self.result = newResult;
    }

    if(!newVote.eq(oldVote)){
      self.votes[user] = newVote;
    }

    emitEvent(user, newVote.get(defaultVote), newVote.isDefault(), newBalance);
  }
}