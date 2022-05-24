// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IGovernanceFactory.sol";
import "../lib/LiquidVoting.sol";
import "../lib/SwapConstants.sol";
import "../lib/SafeCast.sol";

import "hardhat/console.sol";

/*
* Swap governance
*/
abstract contract Governance is ERC20, Ownable, ReentrancyGuard {
  using Vote for Vote.Data;
  using LiquidVoting for LiquidVoting.Data;
  using VirtualVote for VirtualVote.Data;
  using SafeCast for uint256;
  using SafeMath for uint256;

  event FeeVoteUpdated(address indexed user, uint256 fee, bool isDefault, uint256 amount);
  event SlippageFeeVoteUpdated(address indexed user, uint256 slippageFee, bool isDefault, uint256 amount);
  event DecayPeriodUpdated(address indexed user, uint256 decayPeriod, bool isDefault, uint256 amount);

  IGovernanceFactory public governanceFactory; 
  LiquidVoting.Data private _fee;
  LiquidVoting.Data private _slippageFee;
  LiquidVoting.Data private _decayPeriod;

  constructor(IGovernanceFactory _governanceFactory)
  {
    governanceFactory = _governanceFactory;
    _fee.data.result = _governanceFactory.getDefaultFee().toUint104();
    _slippageFee.data.result = _governanceFactory.getDefaultSlippageFee().toUint104();
    _decayPeriod.data.result = _governanceFactory.getDefaultDecayPeriod().toUint104();
  }

  function setGovernanceFactory(IGovernanceFactory _governanceFactory)
    external
    onlyOwner
  {
    governanceFactory = _governanceFactory;
    this.discardFeeVote();
    this.discardSlippageFeeVote();
    this.discardDecayPeriodVote();
  }

  /** Return the current fee */
  function getFee()
    public
    view
    returns(uint256)
  {
    return _fee.data.result;
  }

  /** Return the current slippage fee */
  function getSlippageFee()
    public
    view
    returns(uint256)
  {
    return _slippageFee.data.result;
  }

  /** Return the current decay period */
  function getDecayPeriod()
    public
    view
    returns(uint256)
  {
    return _decayPeriod.data.result;
  }

  function getVirtualFee()
    external
    view
    returns(uint104, uint104, uint48)
  {
    return (_fee.data.oldResult, _fee.data.result, _fee.data.time);
  }

  function getVirtualSlippageFee()
    external
    view
    returns(uint104, uint104, uint48)
  {
    return (_slippageFee.data.oldResult, _slippageFee.data.result, _slippageFee.data.time);
  }

  function getVirtualDecayPeriod()
    external
    view
    returns(uint104, uint104, uint48)
  {
    return (_decayPeriod.data.oldResult, _decayPeriod.data.result, _decayPeriod.data.time);
  }

  /** Return the user vote for the preferred fee */
  function getUserFeeVote(address user)
    external
    view
    returns(uint256)
  {
    return _fee.votes[user].get(governanceFactory.getDefaultFee());
  }

  /** Return the user vote for the preferred slippage fee */
  function getUserSlippageFeeVote(address user)
    external
    view
    returns(uint256)
  {
    return _slippageFee.votes[user].get(governanceFactory.getDefaultSlippageFee());
  }

  /** Return the user vote for the preferred decay period */
  function getUserDecayPeriodVote(address user)
    external
    view
    returns(uint256)
  {
    return _decayPeriod.votes[user].get(governanceFactory.getDefaultDecayPeriod());
  }

  /** Records `msg.senders`'s vote for fee */
  function voteFee(uint256 vote) external
  {
    require(vote <= SwapConstants._MAX_FEE, "GOV_FEE_VOTE_HIGH");
    _fee.updateVote(
      msg.sender, 
      _fee.votes[msg.sender], 
      Vote.init(vote), 
      balanceOf(msg.sender), 
      totalSupply(), 
      governanceFactory.getDefaultFee(), 
      _emitVoteFeeUpdate
    );
  }

  /** Records `msg.senders`'s vote for slippage fee */
  function voteSlippageFee(uint256 vote) external
  {
    require(vote <= SwapConstants._MAX_SLIPPAGE_FEE, "GOV_SLIPPAGE_FEE_VOTE_HIGH");
    _slippageFee.updateVote(
      msg.sender, 
      _slippageFee.votes[msg.sender], 
      Vote.init(vote), 
      balanceOf(msg.sender), 
      totalSupply(), 
      governanceFactory.getDefaultSlippageFee(), 
      _emitVoteSlippageFeeUpdate
    );
  }

  /** Records `msg.senders`'s vote for decay period */
  function voteDecayPeriod(uint256 vote) external
  {
    require(vote <= SwapConstants._MAX_DECAY_PERIOD, "GOV_DECAY_PERIOD_VOTE_HIGH");
    require(vote >= SwapConstants._MIN_DECAY_PERIOD, "GOV_DECAY_PERIOD_VOTE_LOW");
    _decayPeriod.updateVote(
      msg.sender, 
      _decayPeriod.votes[msg.sender], 
      Vote.init(vote), 
      balanceOf(msg.sender), 
      totalSupply(), 
      governanceFactory.getDefaultDecayPeriod(), 
      _emitVoteDecayPeriodUpdate
    );
  }

  /** Retracts `msg.senders`'s vote for fee */
  function discardFeeVote() external
  {
    _fee.updateVote(
      msg.sender, 
      _fee.votes[msg.sender], 
      Vote.init(), 
      balanceOf(msg.sender), 
      totalSupply(), 
      governanceFactory.getDefaultFee(), 
      _emitVoteFeeUpdate
    );
  }

  /** Retracts `msg.senders`'s vote for slippage fee */
  function discardSlippageFeeVote() external
  {
    _slippageFee.updateVote(
      msg.sender, 
      _slippageFee.votes[msg.sender], 
      Vote.init(), 
      balanceOf(msg.sender), 
      totalSupply(), 
      governanceFactory.getDefaultSlippageFee(), 
      _emitVoteSlippageFeeUpdate
    );
  }

  /** Retracts `msg.senders`'s vote for decay period */
  function discardDecayPeriodVote() external
  {
    _decayPeriod.updateVote(
      msg.sender, 
      _decayPeriod.votes[msg.sender], 
      Vote.init(), 
      balanceOf(msg.sender), 
      totalSupply(), 
      governanceFactory.getDefaultDecayPeriod(), 
      _emitVoteDecayPeriodUpdate
    );
  }

  function _emitVoteFeeUpdate(address user, uint256 fee, bool isDefault, uint256 amount) private
  {
    emit FeeVoteUpdated(user, fee, isDefault, amount);
  }

  function _emitVoteSlippageFeeUpdate(address user, uint256 slippageFee, bool isDefault, uint256 amount) private
  {
    emit SlippageFeeVoteUpdated(user, slippageFee, isDefault, amount);
  }

  function _emitVoteDecayPeriodUpdate(address user, uint256 decayPeriod, bool isDefault, uint256 amount) private
  {
    emit DecayPeriodUpdated(user, decayPeriod, isDefault, amount);
  }

  function _beforeTokenTransfer(address from, address to, uint256 amount)
    internal
    override
  {
    if(from == to) {
      return;
    }

    IGovernanceFactory _governanceFactory = governanceFactory;
    bool updateFrom = !(from == address(0) || _governanceFactory.isFeeCollector(from));
    bool updateTo = !(to == address(0) || _governanceFactory.isFeeCollector(to));

    if(!updateFrom && !updateTo) {
      // mint to feeReceiver or burn from feeReceiver
      return;
    }

    uint256 balanceFrom = (from != address(0)) ? balanceOf(from) : 0;
    uint256 balanceTo = (to != address(0)) ? balanceOf(to) : 0;
    uint256 newTotalSupply = totalSupply()
                              .add(from == address(0) ? amount : 0)
                              .sub(to == address(0) ? amount : 0);

    ParamsHelper memory params = ParamsHelper({
      from: from,
      to: to,
      updateFrom: updateFrom,
      updateTo: updateTo,
      amount: amount,
      balanceFrom: balanceFrom,
      balanceTo: balanceTo,
      newTotalSupply: newTotalSupply
    });

    (uint256 defaultFee, uint256 defaultSlippageFee, uint256 defaultDecayPeriod) = _governanceFactory.defaults();
  
    _updateOntransfer(params, defaultFee, _emitVoteFeeUpdate, _fee);
    _updateOntransfer(params, defaultSlippageFee, _emitVoteSlippageFeeUpdate, _slippageFee);
    _updateOntransfer(params, defaultDecayPeriod, _emitVoteDecayPeriodUpdate, _decayPeriod); 
  }

  struct ParamsHelper {
    address from;
    address to;
    bool updateFrom;
    bool updateTo;
    uint256 amount;
    uint256 balanceFrom;
    uint256 balanceTo;
    uint256 newTotalSupply;
  }

  function _updateOntransfer(
    ParamsHelper memory params, 
    uint256 defaultValue,
    function(address, uint256, bool, uint256) internal emitEvent,
    LiquidVoting.Data storage votingData
  ) private
  {
    
    Vote.Data memory voteFrom = votingData.votes[params.from];
    Vote.Data memory voteTo = votingData.votes[params.to];
    /*
    if(voteFrom.isDefault() && voteTo.isDefault() && params.updateFrom && params.updateTo) {
      emitEvent(params.from, voteFrom.get(defaultValue), true, params.balanceFrom.sub(params.amount));
      emitEvent(params.to, voteTo.get(defaultValue), true, params.balanceTo.add(params.amount));
      return;
    }
    */
    if(params.updateFrom) {
      votingData.updateBalance(
        params.from, 
        voteFrom, 
        params.balanceFrom, 
        params.balanceFrom.sub(params.amount), 
        params.newTotalSupply, 
        defaultValue, 
        emitEvent
      );
    }
    
    if(params.updateTo) {
      votingData.updateBalance(
        params.to, 
        voteTo, 
        params.balanceTo, 
        params.balanceTo.add(params.amount), 
        params.newTotalSupply, 
        defaultValue, 
        emitEvent
      );
    }
    
  }

}