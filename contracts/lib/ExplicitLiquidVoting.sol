// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./SafeCast.sol";
import "./VirtualVote.sol";
import "./Vote.sol";


library ExplicitLiquidVoting {
  using SafeMath for uint256;
  using SafeCast for uint256;
  using Vote for Vote.Data;
  using VirtualVote for VirtualVote.Data;

  struct Data {
    VirtualVote.Data data;
    uint256 weightedSum;
    uint256 votedSupply;
    mapping(address => Vote.Data) votes;
  }

  function updateVote(
    ExplicitLiquidVoting.Data storage self,
    address user,
    Vote.Data memory oldVote,
    Vote.Data memory newVote,
    uint256 balance,
    uint256 defaultVote,
    function(address, uint256, bool, uint256) emitEvent
  ) internal {
    return _update(self, user, oldVote, newVote, balance, balance, defaultVote, emitEvent);
  }

  function updateBalance(
    ExplicitLiquidVoting.Data storage self,
    address user,
    Vote.Data memory oldVote,
    uint256 oldBalance,
    uint256 newBalance,
    uint256 defaultVote,
    function(address, uint256, bool, uint256) emitEvent
  ) internal {
    return _update(self, user, oldVote, newBalance == 0 ? Vote.init() : oldVote, oldBalance, newBalance, defaultVote, emitEvent);
  }

  function _update(
    ExplicitLiquidVoting.Data storage self,
    address user,
    Vote.Data memory oldVote,
    Vote.Data memory newVote,
    uint256 oldBalance,
    uint256 newBalance,
    uint256 defaultVote,
    function(address, uint256, bool, uint256) emitEvent
  ) internal {
    uint256 oldWeightedSum = self.weightedSum;
    uint256 newWeightedSum = oldWeightedSum;
    uint256 oldVotedSupply = self.votedSupply;
    uint256 newVotedSupply = oldVotedSupply;

    if(!oldVote.isDefault()) {
      newWeightedSum = newWeightedSum.sub(oldBalance.mul(oldVote.get(defaultVote)));
      newVotedSupply = newVotedSupply.sub(oldBalance);
    }

    if(!newVote.isDefault()) {
      newWeightedSum = newWeightedSum.add(newBalance.mul(newVote.get(defaultVote)));
      newVotedSupply = newVotedSupply.add(newBalance);
    }

    if(newWeightedSum != oldWeightedSum){
      self.weightedSum = newWeightedSum;
    }

    if(newVotedSupply != oldVotedSupply){
      self.votedSupply = newVotedSupply;
    }

    {
      uint256 newResult = newVotedSupply == 0 ? defaultVote : newWeightedSum.div(newVotedSupply);
      VirtualVote.Data memory data = self.data;
      if(newResult != data.result){
        VirtualVote.Data memory sdata = self.data;
        (sdata.oldResult, sdata.result, sdata.time) = (
          data.current().toUint104(),
          newResult.toUint104(),
          block.timestamp.toUint48()
        );
      }
    }

    if(!newVote.eq(oldVote)){
      self.votes[user] = newVote;
    }

    emitEvent(user, newVote.get(defaultVote), newVote.isDefault(), newBalance);
  }
}