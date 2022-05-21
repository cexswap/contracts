// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "../interfaces/IGovernanceFactory.sol";
import "../lib/ExplicitLiquidVoting.sol";
import "../lib/SwapConstants.sol";
import "../lib/SafeCast.sol";
import "../helpers/BalanceHelper.sol";
import "./BaseGovernance.sol";
/*
* Swap Governance Factory
*/
contract GovernanceFactory is IGovernanceFactory, BaseGovernance, BalanceHelper, Ownable, Pausable {
  using Vote for Vote.Data;
  using ExplicitLiquidVoting for ExplicitLiquidVoting.Data;
  using VirtualVote for VirtualVote.Data;
  using SafeMath for uint256;
  using SafeCast for uint256;

  event DefaultFeeVoteUpdate(address indexed user, uint256 fee, bool isDefault, uint256 amount);
  event DefaultSlippageFeeVoteUpdate(address indexed user, uint256 slippageFee, bool isDefault, uint256 amount);
  event DefaultDecayPeriodVoteUpdate(address indexed user, uint256 decayPeriod, bool isDefault, uint256 amount);
  event ReferralShareVoteUpdate(address indexed user, uint256 referralShare, bool isDefault, uint256 amount);
  event GovernanceShareVoteUpdate(address indexed user, uint256 governanceShare, bool isDefault, uint256 amount);
  event GovernanceWalletUpdate(address governanceWallet);
  event FeeCollectorUpdate(address feeCollector);

  ExplicitLiquidVoting.Data private _defaultFee;
  ExplicitLiquidVoting.Data private _defaultSlippageFee;
  ExplicitLiquidVoting.Data private _defaultDecayPeriod;
  ExplicitLiquidVoting.Data private _referralShare;
  ExplicitLiquidVoting.Data private _governanceShare;

  /// @inheritdoc IGovernanceFactory
  address public override governanceWallet;

  /// @inheritdoc IGovernanceFactory
  address public override feeCollector;

  mapping(address => bool) public override isFeeCollector;

  constructor(address _mothership) BaseGovernance(_mothership)
  {
    _defaultFee.data.result = SwapConstants._DEFAULT_FEE.toUint104();
    _defaultSlippageFee.data.result = SwapConstants._DEFAULT_SLIPPAGE_FEE.toUint104();
    _defaultDecayPeriod.data.result = SwapConstants._DEFAULT_DECAY_PERIOD.toUint104();
    _referralShare.data.result = SwapConstants._DEFAULT_REFERRAL_SHARE.toUint104();
    _governanceShare.data.result = SwapConstants._DEFAULT_GOVERNANCE_SHARE.toUint104();
  }

  function shutdown() external onlyOwner
  {
    _pause();
  }

  /// @inheritdoc IGovernanceFactory
  function isActive()
    external 
    view 
    override
    returns(bool)
  {
    return !paused();
  }

  /// @inheritdoc IGovernanceFactory
  function getShareParameters()
    external 
    view 
    override
    returns(uint256, uint256, address, address)
  {
    return (_referralShare.data.current(), _governanceShare.data.current(), governanceWallet, feeCollector);
  }  

  /// @inheritdoc IGovernanceFactory
  function defaults()
    external 
    view 
    override
    returns(uint256, uint256, uint256)
  {
    return (_defaultFee.data.current(), _defaultSlippageFee.data.current(), _defaultDecayPeriod.data.current());
  }

  /// @inheritdoc IGovernanceFactory
  function getDefaultFee()
    external 
    view 
    override
    returns(uint256)
  {
    return _defaultFee.data.current();
  }

  /// @inheritdoc IGovernanceFactory
  function getDefaultSlippageFee()
    external 
    view 
    override
    returns(uint256)
  {
    return _defaultSlippageFee.data.current();
  }

  /// @inheritdoc IGovernanceFactory
  function getDefaultDecayPeriod()
    external 
    view 
    override
    returns(uint256)
  {
    return _defaultDecayPeriod.data.current();
  }

  /// @inheritdoc IGovernanceFactory
  function getVirtualDefaultFee()
    external 
    view 
    override
    returns(uint104, uint104, uint48)
  {
    return (_defaultFee.data.oldResult, _defaultFee.data.result, _defaultFee.data.time);
  }

  /// @inheritdoc IGovernanceFactory
  function getVirtualDefaultSlippageFee()
    external 
    view 
    override
    returns(uint104, uint104, uint48)
  {
    return (_defaultSlippageFee.data.oldResult, _defaultSlippageFee.data.result, _defaultSlippageFee.data.time);
  }

  /// @inheritdoc IGovernanceFactory
  function getVirtualDefaultDecayPeriod()
    external 
    view 
    override
    returns(uint104, uint104, uint48)
  {
    return (_defaultDecayPeriod.data.oldResult, _defaultDecayPeriod.data.result, _defaultDecayPeriod.data.time);
  }

  function getVirtualReferralShare()
    external 
    view 
    returns(uint104, uint104, uint48)
  {
    return (_referralShare.data.oldResult, _referralShare.data.result, _referralShare.data.time);
  }

  function getVirtualGovernanceShare()
    external 
    view 
    returns(uint104, uint104, uint48)
  {
    return (_governanceShare.data.oldResult, _governanceShare.data.result, _governanceShare.data.time);
  }

  /// @inheritdoc IGovernanceFactory
  function getReferralShare()
    external 
    view 
    override
    returns(uint256)
  {
    return _referralShare.data.current();
  }

  /// @inheritdoc IGovernanceFactory
  function getGovernanceShare()
    external 
    view 
    override
    returns(uint256)
  {
    return _governanceShare.data.current();
  }

  function getDefaultFeeVotes(address user) external view returns(uint256)
  {
    return _defaultFee.votes[user].get(SwapConstants._DEFAULT_FEE);
  }

  function getDefaultSlippageFeeVotes(address user) external view returns(uint256)
  {
    return _defaultSlippageFee.votes[user].get(SwapConstants._DEFAULT_SLIPPAGE_FEE);
  }

  function getDefaultDecayPeriodVotes(address user) external view returns(uint256)
  {
    return _defaultDecayPeriod.votes[user].get(SwapConstants._DEFAULT_DECAY_PERIOD);
  }

  function getReferralShareVotes(address user) external view returns(uint256)
  {
    return _referralShare.votes[user].get(SwapConstants._DEFAULT_REFERRAL_SHARE);
  }

  function getGovernanceShareVotes(address user) external view returns(uint256)
  {
    return _governanceShare.votes[user].get(SwapConstants._DEFAULT_GOVERNANCE_SHARE);
  }

  function setGovernanceWallet(address _governanceWallet) external onlyOwner
  {
    governanceWallet = _governanceWallet;
    emit GovernanceWalletUpdate(_governanceWallet);
  }

  function setFeeCollector(address _feeCollector) external onlyOwner
  {
    feeCollector = _feeCollector;
    isFeeCollector[_feeCollector] = true;
    emit FeeCollectorUpdate(_feeCollector);
  }

  /** Records `msg.senders`'s vote for fee */
  function defaultVoteFee(uint256 vote) external
  {
    require(vote <= SwapConstants._MAX_FEE, "GOV_FACT_FEE_VOTE_HIGH");
    _defaultFee.updateVote(
      msg.sender, 
      _defaultFee.votes[msg.sender], 
      Vote.init(vote), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_FEE, 
      _emitDefaultVoteFeeUpdate
    );
  }

  /** Retracts `msg.senders`'s vote for fee */
  function discardDefaultFeeVote() external
  {
    _defaultFee.updateVote(
      msg.sender, 
      _defaultFee.votes[msg.sender], 
      Vote.init(), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_FEE,
      _emitDefaultVoteFeeUpdate
    );
  }

  /** Records `msg.senders`'s vote for slippage fee */
  function defaultVoteSlippageFee(uint256 vote) external
  {
    require(vote <= SwapConstants._MAX_SLIPPAGE_FEE, "GOV_FACT_SLIPPAGE_FEE_VOTE_HIGH");
    _defaultSlippageFee.updateVote(
      msg.sender, 
      _defaultSlippageFee.votes[msg.sender], 
      Vote.init(vote), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_SLIPPAGE_FEE, 
      _emitDefaultVoteSlippageFeeUpdate
    );
  }

  /** Retracts `msg.senders`'s vote for slippage fee */
  function discardDefaultSlippageFeeVote() external
  {
    _defaultSlippageFee.updateVote(
      msg.sender, 
      _defaultSlippageFee.votes[msg.sender], 
      Vote.init(), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_SLIPPAGE_FEE, 
      _emitDefaultVoteSlippageFeeUpdate
    );
  }

  /** Records `msg.senders`'s vote for decay period */
  function defaultVoteDecayPeriod(uint256 vote) external
  {
    require(vote <= SwapConstants._MAX_DECAY_PERIOD, "GOV_FACT_DECAY_PERIOD_VOTE_HIGH");
    require(vote >= SwapConstants._MIN_DECAY_PERIOD, "GOV_FACT_DECAY_PERIOD_VOTE_LOW");
    _defaultDecayPeriod.updateVote(
      msg.sender, 
      _defaultDecayPeriod.votes[msg.sender], 
      Vote.init(vote), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_DECAY_PERIOD, 
      _emitDefaultVoteDecayPeriodUpdate
    );
  }

  /** Retracts `msg.senders`'s vote for decay period */
  function discardDefaultDecayPeriodVote() external
  {
    _defaultDecayPeriod.updateVote(
      msg.sender, 
      _defaultDecayPeriod.votes[msg.sender], 
      Vote.init(), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_DECAY_PERIOD, 
      _emitDefaultVoteDecayPeriodUpdate
    );
  }

  /** Records `msg.senders`'s vote for referral share */
  function voteReferralShare(uint256 vote) external
  {
    require(vote <= SwapConstants._MAX_SHARE, "GOV_FACT_REFER_SHARE_VOTE_HIGH");
    require(vote >= SwapConstants._MIN_REFERRAL_SHARE, "GOV_FACT_REFER_SHARE_VOTE_LOW");
    _referralShare.updateVote(
      msg.sender, 
      _referralShare.votes[msg.sender], 
      Vote.init(vote), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_REFERRAL_SHARE,
      _emitVoteReferralShareUpdate
    );
  }

  /** Retracts `msg.senders`'s vote for referral share */
  function discardReferralShareVote() external
  {
    _referralShare.updateVote(
      msg.sender, 
      _referralShare.votes[msg.sender], 
      Vote.init(), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_REFERRAL_SHARE,
      _emitVoteReferralShareUpdate
    );
  }

  /** Records `msg.senders`'s vote for governance share */
  function voteGovernanceShare(uint256 vote) external
  {
    require(vote <= SwapConstants._MAX_SHARE, "GOV_FACT_GOV_SHARE_VOTE_HIGH");
    _governanceShare.updateVote(
      msg.sender, 
      _governanceShare.votes[msg.sender], 
      Vote.init(vote), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_GOVERNANCE_SHARE,
      _emitVoteGovernanceShareUpdate
    );
  }

  /** Retracts `msg.senders`'s vote for governance share */
  function discardGovernanceShareVote() external
  {
    _governanceShare.updateVote(
      msg.sender, 
      _governanceShare.votes[msg.sender], 
      Vote.init(), 
      balanceOf(msg.sender), 
      SwapConstants._DEFAULT_GOVERNANCE_SHARE,
      _emitVoteGovernanceShareUpdate
    );
  }

  function _updateStakeChanged(address account, uint256 newBalance) internal override
  {
    uint256 balance = _set(account, newBalance);
    if(newBalance == balance){
      return;
    }

    _defaultFee.updateBalance(
      account, 
      _defaultFee.votes[account], 
      balance, 
      newBalance, 
      SwapConstants._DEFAULT_FEE,
      _emitDefaultVoteFeeUpdate
    );

    _defaultSlippageFee.updateBalance(
      account, 
      _defaultSlippageFee.votes[account], 
      balance, 
      newBalance, 
      SwapConstants._DEFAULT_SLIPPAGE_FEE,
      _emitDefaultVoteSlippageFeeUpdate
    );

    _defaultDecayPeriod.updateBalance(
      account, 
      _defaultDecayPeriod.votes[account], 
      balance, 
      newBalance, 
      SwapConstants._DEFAULT_DECAY_PERIOD,
      _emitDefaultVoteDecayPeriodUpdate
    );

    _referralShare.updateBalance(
      account, 
      _referralShare.votes[account], 
      balance, 
      newBalance, 
      SwapConstants._DEFAULT_REFERRAL_SHARE,
      _emitVoteReferralShareUpdate
    );

    _governanceShare.updateBalance(
      account, 
      _governanceShare.votes[account], 
      balance, 
      newBalance, 
      SwapConstants._DEFAULT_GOVERNANCE_SHARE,
      _emitVoteGovernanceShareUpdate
    );
  }

  function _emitDefaultVoteFeeUpdate(address user, uint256 fee, bool isDefault, uint256 amount) private
  {
    emit DefaultFeeVoteUpdate(user, fee, isDefault, amount);
  }

  function _emitDefaultVoteSlippageFeeUpdate(address user, uint256 slippageFee, bool isDefault, uint256 amount) private
  {
    emit DefaultSlippageFeeVoteUpdate(user, slippageFee, isDefault, amount);
  }

  function _emitDefaultVoteDecayPeriodUpdate(address user, uint256 decayPeriod, bool isDefault, uint256 amount) private
  {
    emit DefaultDecayPeriodVoteUpdate(user, decayPeriod, isDefault, amount);
  }

  function _emitVoteReferralShareUpdate(address user, uint256 referralShare, bool isDefault, uint256 amount) private
  {
    emit ReferralShareVoteUpdate(user, referralShare, isDefault, amount);
  }

  function _emitVoteGovernanceShareUpdate(address user, uint256 governanceShare, bool isDefault, uint256 amount) private
  {
    emit GovernanceShareVoteUpdate(user, governanceShare, isDefault, amount);
  }
}