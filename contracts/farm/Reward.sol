// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../Swap.sol";
import "../lib/SwapConstants.sol";
import "../lib/Voting.sol";
import "../lib/FADERC20.sol";
import "../helpers/AbstractReward.sol";

/*
* Farming rewards contract
*/
contract Reward is AbstractReward {
    using Vote for Vote.Data;
    using Voting for Voting.Data;
    using FADERC20 for IERC20;
    using SafeMath for uint256;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event FeeVoteUpdate(address indexed user, uint256 fee, bool isDefault, uint256 amount);
    event SlippageFeeVoteUpdate(address indexed user, uint256 slippageFee, bool isDefault, uint256 amount);
    event DecayPeriodVoteUpdate(address indexed user, uint256 decayPeriod, bool isDefault, uint256 amount);

    event Transfer(address indexed from, address indexed to, uint256 value);

    Swap public immutable swap;
    IGovernanceFactory public immutable governanceFactory;

    Voting.Data private _fee;
    Voting.Data private _slippageFee;
    Voting.Data private _decayPeriod;

    constructor(Swap _swap, IERC20 _gift, uint256 _duration, address _rewardDistributor, uint256 scale)
    {
      swap = _swap;
      governanceFactory = _swap.governanceFactory();
      addRewardGift(_gift, _duration, _rewardDistributor, scale);
    }

    function name() external view returns(string memory)
    {
      return string(abi.encodePacked("Farming: ", swap.name()));
    }

    function symbol() external view returns(string memory)
    {
      return string(abi.encodePacked("farm: ", swap.symbol()));
    }

    function decimals() external view returns(uint8)
    {
      return swap.decimals();
    }

    /** Stakes `amount` of tokens into farm */
    function stake(uint256 amount) public updateAccountReward(msg.sender)
    {
      require(amount > 0, "REWARD_CANT_STAKE_ZERO");
      swap.transferFrom(msg.sender, address(this), amount);
      _mint(msg.sender, amount);

      emit Staked(msg.sender, amount);
      emit Transfer(address(0), msg.sender, amount);
    }

    /** Withdraws `amount` of tokens from farm */
    function withdraw(uint256 amount) public updateAccountReward(msg.sender)
    {
      require(amount > 0, "REWARD_CANT_WITHDRAW_ZERO");
      _burn(msg.sender, amount);
      swap.transfer(msg.sender, amount);

      emit Withdrawn(msg.sender, amount);
      emit Transfer(msg.sender, address(0), amount);
    }

    /** Withdraws all staked funds and rewards */
    function exit() external
    {
      withdraw(balanceOf(msg.sender));
      getAllReward();
    }

    function getFee() public view returns(uint256)
    {
      return _fee.result;
    } 

    function getSlippageFee() public view returns(uint256)
    {
      return _slippageFee.result;
    } 

    function getDecayPeriod() public view returns(uint256)
    {
      return _decayPeriod.result;
    } 

    function getFeeVotes(address user) external view returns(uint256)
    {
      return _fee.votes[user].get(governanceFactory.getDefaultFee);
    }

    function getSlippageFeeVotes(address user) external view returns(uint256)
    {
      return _slippageFee.votes[user].get(governanceFactory.getDefaultSlippageFee);
    }

    function getDecayPeriodVotes(address user) external view returns(uint256)
    {
      return _slippageFee.votes[user].get(governanceFactory.getDefaultDecayPeriod);
    }

    function voteFee(uint256 vote) external
    {
      require(vote <= SwapConstants._MAX_FEE, "REWARD_FEE_VOTE_HIGH");
      _fee.updateVote(
        msg.sender, 
        _fee.votes[msg.sender], 
        Vote.init(vote), 
        balanceOf(msg.sender), 
        totalSupply(),
        governanceFactory.getDefaultFee(), 
        _emitVoteFeeUpdate
      );

      _vote(_fee, swap.voteFee, swap.discardFeeVote);
    }

    function voteSlippageFee(uint256 vote) external
    {
      require(vote <= SwapConstants._MAX_SLIPPAGE_FEE, "REWARD_SLIPPAGE_FEE_VOTE_HIGH");
      _slippageFee.updateVote(
        msg.sender, 
        _slippageFee.votes[msg.sender], 
        Vote.init(vote), 
        balanceOf(msg.sender), 
        totalSupply(),
        governanceFactory.getDefaultSlippageFee(), 
        _emitVoteSlippageFeeUpdate
      );

      _vote(_slippageFee, swap.voteSlippageFee, swap.discardSlippageFeeVote);
    }

    function voteDecayPeriod(uint256 vote) external
    {
      require(vote <= SwapConstants._MAX_DECAY_PERIOD, "REWARD_DECAY_PERIOD_VOTE_HIGH");
      require(vote >= SwapConstants._MIN_DECAY_PERIOD, "REWARD_DECAY_PERIOD_VOTE_LOW");
      _decayPeriod.updateVote(
        msg.sender, 
        _decayPeriod.votes[msg.sender], 
        Vote.init(vote), 
        balanceOf(msg.sender), 
        totalSupply(),
        governanceFactory.getDefaultDecayPeriod(), 
        _emitVoteDecayPeriodUpdate
      );

      _vote(_decayPeriod, swap.voteDecayPeriod, swap.discardDecayPeriodVote);
    }

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

    function discardDecayPeriodVote() external
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

    function _mint(address account, uint256 amount) internal override
    {
      super._mint(account, amount);

      uint256 newBalance = balanceOf(account);
      _updateVotes(account, newBalance.sub(amount), newBalance, totalSupply());
    }

    function _burn(address account, uint256 amount) internal override
    {
      super._burn(account, amount);

      uint256 newBalance = balanceOf(account);
      _updateVotes(account, newBalance.add(amount), newBalance, totalSupply());
    }

    function _updateVotes(address account, uint256 balance, uint256 newBalance, uint256 newTotalSupply) private
    {
      _fee.updateBalance(
        account, 
        _fee.votes[account], 
        balance, 
        newBalance, 
        newTotalSupply, 
        governanceFactory.getDefaultFee(), 
        _emitVoteFeeUpdate
      );

      _vote(_fee, swap.voteFee, swap.discardFeeVote);

      _slippageFee.updateBalance(
        account, 
        _slippageFee.votes[account], 
        balance, 
        newBalance, 
        newTotalSupply, 
        governanceFactory.getDefaultSlippageFee(), 
        _emitVoteSlippageFeeUpdate
      );

      _vote(_slippageFee, swap.voteSlippageFee, swap.discardSlippageFeeVote);

      _decayPeriod.updateBalance(
        account, 
        _decayPeriod.votes[account], 
        balance, 
        newBalance, 
        newTotalSupply, 
        governanceFactory.getDefaultDecayPeriod(), 
        _emitVoteDecayPeriodUpdate
      );

      _vote(_decayPeriod, swap.voteDecayPeriod, swap.discardDecayPeriodVote);
    }

    function _vote(Voting.Data storage votingData, function(uint256) external vote, function() external discardVote) private {
      if(votingData.weightedSum == 0){
        discardVote();
      } else {
        vote(votingData.result);
      }
    }

    function _emitVoteFeeUpdate(address user, uint256 fee, bool isDefault, uint256 amount) private
    {
      emit FeeVoteUpdate(user, fee, isDefault, amount);
    }

    function _emitVoteSlippageFeeUpdate(address user, uint256 slippageFee, bool isDefault, uint256 amount) private
    {
      emit SlippageFeeVoteUpdate(user, slippageFee, isDefault, amount);
    }

    function _emitVoteDecayPeriodUpdate(address user, uint256 decayPeriod, bool isDefault, uint256 amount) private
    {
      emit DecayPeriodVoteUpdate(user, decayPeriod, isDefault, amount);
    }

    /** Allows contract owner to withdraw funds that was send to contract by mistake */
  function rescueFunds(IERC20 token, uint256 amount)
    external
    onlyOwner
  {
    for(uint256 i = 0; i < tokenRewards.length; i++) {
      require(token != tokenRewards[i].gift, "REWARD_CANT_RESCUE_GIFT");
    }

    token.fadTransfer(payable(msg.sender), amount);

    if(token == swap) {
      require(token.getBalanceOf(address(this)) == totalSupply(), "REWARD_CANT_WITHDRAW_FUNDS");
    }
  }
}