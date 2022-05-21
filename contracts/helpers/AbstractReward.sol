// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./BalanceHelper.sol";


/*
* Provides helper methods for token-like contracts
*/
abstract contract AbstractReward is Ownable, BalanceHelper {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  event RewardAdded(uint256 indexed position, uint256 reward);
  event RewardDurationUpdated(uint256 indexed position, uint256 duration);
  event RewardScaleUpdated(uint256 indexed position, uint256 scale);
  event RewardPaid(uint256 indexed position, address indexed user, uint256 reward);
  event RewardDistributorChanged(uint256 indexed position, address rewardDistributor);
  event RewardGiftAdded(uint256 indexed position, IERC20 gift);

  struct TokenReward {
    IERC20 gift;
    uint256 scale;
    uint256 duration;
    address rewardDistributor;
    uint256 endDate;
    uint256 rate;
    uint256 lastUpdateTime;
    uint256 rewardPerToken;
    mapping(address => uint256) userRewardPerTokenPaid;
    mapping(address => uint256) rewards;
  }

  TokenReward[] public tokenRewards;

  modifier updateAccountReward(address account){
    uint256 length = tokenRewards.length;
    for(uint i = 0; i < length; i++) {
      TokenReward storage tokenReward = tokenRewards[i];
      uint256 newRewardPerToken = getRewardPerToken(i);
      tokenReward.rewardPerToken = newRewardPerToken;
      tokenReward.lastUpdateTime = getRewardLastTimeApplicable(i);
      if(account != address(0)){
        tokenReward.rewards[account] = _getAccountEarnedReward(i, account, newRewardPerToken);
        tokenReward.userRewardPerTokenPaid[account] = newRewardPerToken;
      }
    }
    _;
  }

  modifier onlyRewardDistributor(uint position) {
    require(msg.sender == tokenRewards[position].rewardDistributor, "AREWARD_ONLY_DISTRIBUTOR");
    _;
  }

  /**
  * Returns current reward per token
  */
  function getRewardPerToken(uint position)
    public
    view
    returns(uint256)
  {
    TokenReward storage tokenReward = tokenRewards[position];
    if( totalSupply() == 0) {
      return tokenReward.rewardPerToken;
    }

    return tokenReward.rewardPerToken.add(
      getRewardLastTimeApplicable(position)
          .sub(tokenReward.lastUpdateTime)
          .mul(tokenReward.rate)
          .div(totalSupply())
    );
  }

  /** Returns last time specific token reward was applicable */
  function getRewardLastTimeApplicable(uint position)
    public
    view
    returns(uint256)
  {
    return Math.min(block.timestamp, tokenRewards[position].endDate);
  }

  /** Returns how many tokens account currently has */
  function getAccountEarnedReward(uint position, address account)
    public
    view
    returns(uint256)
  {
    return _getAccountEarnedReward(position, account, getRewardPerToken(position));
  }

  /** Withdraws sender's reward */
  function getReward(uint position)
    public
    updateAccountReward(msg.sender)
  {
    TokenReward storage tokenReward = tokenRewards[position];
    uint256 reward = tokenReward.rewards[msg.sender];
    if(reward > 0){
      tokenReward.rewards[msg.sender] = 0;
      tokenReward.gift.safeTransfer(msg.sender, reward);

      emit RewardPaid(position, msg.sender, reward);
    }
  }

  function getAllReward()
    public
  {
    uint256 length = tokenRewards.length;
    for(uint i = 0 ; i < length; i++){
      getReward(i);
    }
  }

  /** Updates specific token rewards amount */
  function updateRewardAmount(uint position, uint256 reward)
    external 
    onlyRewardDistributor(position)
    updateAccountReward(address(0))
  {
    TokenReward storage tokenReward = tokenRewards[position];
    uint256 scale = tokenReward.scale;
    require(reward < type(uint).max.div(scale), "AREWARD_REWARD_OVERLOW");
    uint256 duration = tokenReward.duration;
    uint256 rewardRate;

    if(block.timestamp >= tokenReward.endDate){
      require(reward >= duration, "AREWARD_REWARD_TOO_SMALL");
      rewardRate = reward.mul(scale).div(duration);
    } else {
      uint256 remaining = tokenReward.endDate.sub(block.timestamp);
      uint256 leftOver = remaining.mul(tokenReward.rate).div(scale);
      require(reward.add(leftOver) >= duration, "AREWARD_REWARD_TOO_SMALL");
      rewardRate = reward.add(leftOver).mul(scale).div(duration);
    }

    uint256 balance = tokenReward.gift.balanceOf(address(this));
    require(rewardRate <= balance.mul(scale).div(duration), "AREWARD_REWARD_TOO_BIG");
    tokenReward.rate = rewardRate;
    tokenReward.lastUpdateTime = block.timestamp;
    tokenReward.endDate = block.timestamp.add(duration);

    emit RewardAdded(position, reward);
  }

  /** Updates rewards distributor */
  function setRewardDistributor(uint position, address rewardDistributor)
    external 
    onlyOwner
  {
    TokenReward storage tokenReward = tokenRewards[position];
    tokenReward.rewardDistributor = rewardDistributor;

    emit RewardDistributorChanged(position, rewardDistributor);
  }

  /** Updates rewards duration */
  function setRewardDuration(uint position, uint256 duration)
    external
    onlyRewardDistributor(position)
  {
    TokenReward storage tokenReward = tokenRewards[position];
    require(block.timestamp >= tokenReward.endDate, "AREWARD_REWARD_ONGOING");
    tokenReward.duration = duration;

    emit RewardDurationUpdated(position, duration);
  }

  /** Updates rewards scale */
  function setRewardScale(uint position, uint256 scale)
    external
    onlyOwner
  {
    require(scale > 0, "AREWARD_REWARD_SCALE_TOO_LOW");
    require(scale <= 1e36, "AREWARD_REWARD_SCALE_TOO_HIGH");
    TokenReward storage tokenReward = tokenRewards[position];

    require(tokenReward.endDate == 0, "AREWARD_CANT_CHANGE_AFTER_START");
    tokenReward.scale = scale;

    emit RewardScaleUpdated(position, scale);
  }


  /** Adds new token to the list */
  function addRewardGift(IERC20 gift, uint256 duration, address rewardDistributor, uint256 scale)
    public
    onlyOwner
  {
    require(scale > 0, "AREWARD_REWARD_SCALE_TOO_LOW");
    require(scale <= 1e36, "AREWARD_REWARD_SCALE_TOO_HIGH");
    uint256 length = tokenRewards.length;
    for(uint i = 0; i < length; i++){
      require(gift != tokenRewards[i].gift, "AREWARD_GIFT_ALREADY_ADDED");
    }

    TokenReward storage tokenReward = tokenRewards.push();
    tokenReward.gift = gift;
    tokenReward.duration = duration;
    tokenReward.scale = scale;
    tokenReward.rewardDistributor = rewardDistributor;

    emit RewardGiftAdded(length, gift);
    emit RewardDurationUpdated(length, duration);
    emit RewardDistributorChanged(length, rewardDistributor);
  }
  
  function _getAccountEarnedReward(uint position, address account, uint256 rewardPerToken)
    private
    view
    returns(uint256)
  {
    TokenReward storage tokenReward = tokenRewards[position];
    return balanceOf(account)
              .mul(rewardPerToken.sub(tokenReward.userRewardPerTokenPaid[account]))
              .div(tokenReward.scale)
              .add(tokenReward.rewards[account]); 
  }
}