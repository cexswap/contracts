// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFeeCollector.sol";
import "./lib/FADERC20.sol";
import "./helpers/Converter.sol";

/*
* The Referral Fee Collector
*/
contract ReferralFeeReceiver is IFeeCollector, Converter, ReentrancyGuard {
  using FADERC20 for IERC20;
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  struct UserInfo {
    uint256 balance;
    mapping(IERC20 => mapping(uint256 => uint256)) share;
    mapping(IERC20 => uint256) firstUnprocessedEpoch;
  }

  struct EpochBalance {
    uint256 totalSupply;
    uint256 token0Balance;
    uint256 token1Balance;
    uint256 fadBalance;
  }

  struct TokenInfo {
    mapping(uint256 => EpochBalance) epochBalance;
    uint256 firstUnprocessedEpoch;
    uint256 currentEpoch;
  }

  mapping(address => UserInfo) public userInfo;
  mapping(IERC20 => TokenInfo) public tokenInfo;

  constructor(IERC20 fadToken, ISwapFactory _swapFactory) Converter(fadToken, _swapFactory){}

  /// @inheritdoc IFeeCollector
  function updateRewards(address[] calldata receivers, uint256[] calldata amounts) external override
  {
    for(uint i = 0; i < receivers.length; i++) {
      updateReward(receivers[i], amounts[i]);
    }
  }

  /// @inheritdoc IFeeCollector
  function updateReward(address referral, uint256 amount) public override
  {
    Swap swap = Swap(msg.sender);
    TokenInfo storage token = tokenInfo[swap];
    UserInfo storage user = userInfo[referral];
    uint256 currentEpoch = token.currentEpoch;

    // Add new reward to current epoch
    user.share[swap][currentEpoch] = user.share[swap][currentEpoch].add(amount);
    token.epochBalance[currentEpoch].totalSupply = token.epochBalance[currentEpoch].totalSupply.add(amount);

    // Collect all processed epochs and advance user token epoch
    _collectProcessedEpochs(user, token, swap, currentEpoch);
  }

  /** Freezes current epoch and creates new as an active one */
  function freezeEpoch(Swap swap) external nonReentrant validPool(swap) validSpread(swap) 
  {
    TokenInfo storage token = tokenInfo[swap];
    uint256 currentEpoch = token.currentEpoch;
    require(token.firstUnprocessedEpoch == currentEpoch, "FEE_COLLECT_PREV_EPOCH_NOT_END");
    IERC20[] memory tokens = swap.getTokens();
    uint256 token0Balance = tokens[0].getBalanceOf(address(this));
    uint256 token1Balance = tokens[1].getBalanceOf(address(this));
    swap.withdraw(swap.balanceOf(address(this)), new uint256[](0));
    token.epochBalance[currentEpoch].token0Balance = tokens[0].getBalanceOf(address(this)).sub(token0Balance);
    token.epochBalance[currentEpoch].token1Balance = tokens[1].getBalanceOf(address(this)).sub(token1Balance);
    token.currentEpoch = token.currentEpoch.add(1);
  }

  /** Perform chain swap described by `path`. First element of `path` should match either token of the `Swap`.
  * The last token in chain should always be `FAD` 
  */
  function trade(Swap swap, IERC20[] memory path) external nonReentrant validPool(swap) validSpread(swap)
  {
    TokenInfo storage token = tokenInfo[swap];
    uint256 firstUnprocessedEpoch = token.firstUnprocessedEpoch;
    EpochBalance storage epochBalance = token.epochBalance[firstUnprocessedEpoch];
    require(firstUnprocessedEpoch.add(1) == token.currentEpoch, "FEE_COLLECT_PREV_EPOCH_ENDED");
    IERC20[] memory tokens = swap.getTokens();
    uint256 availableBalance;
    if(path[0] == tokens[0]) {
      availableBalance = epochBalance.token0Balance;
    } else if(path[0] == tokens[1]) {
      availableBalance = epochBalance.token1Balance;
    } else {
      revert("Invalid first token");
    }

    (uint256 amount, uint256 returnAmount) = _getMaxAmountForSwap(path, availableBalance);
    if(returnAmount == 0) {
      // get rid of dust
      if(availableBalance > 0) {
        require(availableBalance == amount, "FEE_COLLECT_AVAIL_BAL_NOT_DUST");
        for(uint256 i = 0; i + 1 < path.length; i += 1) {
          Swap _swap = swapFactory.pools(path[i], path[i + 1]);
          require(_validateSpread(_swap), "FEE_COLLECT_SPREAD_TOO_HIGH");
        }

        if(path[0].isNativeToken()){
          payable(tx.origin).transfer(availableBalance);
        } else {
          path[0].safeTransfer(address(swap), availableBalance);
        }
      }
    } else {
      uint256 receivedAmount = _swap(path, amount, payable(address(this)));
      epochBalance.fadBalance = epochBalance.fadBalance.add(receivedAmount);
    }

    if(path[0] == tokens[0]) {
      epochBalance.token0Balance = epochBalance.token0Balance.sub(amount);
    } else if(path[0] == tokens[1]) {
      epochBalance.token1Balance = epochBalance.token1Balance.sub(amount);
    }

    if(epochBalance.token0Balance == 0 && epochBalance.token1Balance == 0) {
      token.firstUnprocessedEpoch = token.firstUnprocessedEpoch.add(1);
    }
  }

  /** Collects `msg.sender`'s tokens from pools and transfers them to him */
  function claim(Swap[] memory pools) external {
    UserInfo storage user = userInfo[msg.sender];
    for(uint256 i = 0; i < pools.length; i++) {
      Swap swap = pools[i];
      TokenInfo storage token = tokenInfo[swap];
      _collectProcessedEpochs(user, token, swap, token.currentEpoch);
    }

    uint256 balance = user.balance;
    if(balance > 1) {
      // Avoid erasing storage to decrease gas footprint for referral payments
      user.balance = 1;
      fadToken.transfer(msg.sender, balance - 1);
    }
  }

  /** Collects current epoch `msg.sender`'s tokens from pool and transfers them to him */
  function claimCurrentEpoch(Swap swap) external nonReentrant validPool(swap) {
    UserInfo storage user = userInfo[msg.sender];
    TokenInfo storage token = tokenInfo[swap];
    uint256 currentEpoch = token.currentEpoch;
    uint256 balance = user.share[swap][currentEpoch];
    if(balance > 0) {
      user.share[swap][currentEpoch] = 0;
      token.epochBalance[currentEpoch].totalSupply = token.epochBalance[currentEpoch].totalSupply.sub(balance);
      swap.transfer(msg.sender, balance);
    }
  }

  /** Collects frozen epoch `msg.sender`'s tokens from pool and transfers them to him */
  function claimFrozenEpoch(Swap swap) external nonReentrant validPool(swap) {
    UserInfo storage user = userInfo[msg.sender];
    TokenInfo storage token = tokenInfo[swap];
    uint256 currentEpock = token.currentEpoch;
    uint256 firstUnprocessedEpoch = token.firstUnprocessedEpoch;
    require(firstUnprocessedEpoch.add(1) == token.currentEpoch, "FEE_COLLECT_EPOCH_ENDED");
    require(user.firstUnprocessedEpoch[swap] == firstUnprocessedEpoch, "FEE_COLLECT_EPOCH_FUND_CLAIMED");
    user.firstUnprocessedEpoch[swap] = currentEpock;
    uint256 share = user.share[swap][firstUnprocessedEpoch];
    if(share > 0) {
      EpochBalance storage epochBalance = token.epochBalance[firstUnprocessedEpoch];
      uint256 totalSupply = epochBalance.totalSupply;
      user.share[swap][firstUnprocessedEpoch] = 0;
      epochBalance.totalSupply = totalSupply.sub(share);

      IERC20[] memory tokens = swap.getTokens();
      epochBalance.token0Balance = _transferTokenShare(tokens[0], epochBalance.token0Balance, share, totalSupply);
      epochBalance.token1Balance = _transferTokenShare(tokens[1], epochBalance.token1Balance, share, totalSupply);
      epochBalance.fadBalance = _transferTokenShare(fadToken, epochBalance.fadBalance, share, totalSupply);
    }
  }

  function _transferTokenShare(IERC20 token, uint256 balance, uint256 share, uint256 totalSupply) 
    private 
    returns(uint256 newBalance)
  {
    uint256 amount = balance.mul(share).div(totalSupply);
    if(amount > 0) {
      token.fadTransfer(payable(msg.sender), amount);
    }

    return balance.sub(amount);
  }

  function _collectProcessedEpochs(UserInfo storage user, TokenInfo storage token, Swap swap, uint256 currentEpoch) private
  {
    uint256 userEpoch = user.firstUnprocessedEpoch[swap];

    // Early return for the new users
    if(user.share[swap][userEpoch] == 0) {
      user.firstUnprocessedEpoch[swap] = currentEpoch;
      return;
    }

    uint256 tokenEpoch = token.firstUnprocessedEpoch;
    if(tokenEpoch <= userEpoch) {
      return;
    }

    uint256 epochCount = Math.min(2, tokenEpoch - userEpoch); // 0, 1 or 2 epochs

    // Claim 1 or 2 processed epochs for the user
    uint256 collected = _collectEpoch(user, token, swap, userEpoch);
    if(epochCount > 1) {
      collected = collected.add(_collectEpoch(user, token, swap, userEpoch + 1));
    }

    user.balance = user.balance.add(collected);

    // Update user token epoch counter
    bool emptySecondEpoch = user.share[swap][userEpoch + 1] == 0;
    user.firstUnprocessedEpoch[swap] = (epochCount == 2 || emptySecondEpoch) ? currentEpoch : userEpoch + 1;
  }

  function _collectEpoch(UserInfo storage user, TokenInfo storage token, Swap swap, uint256 epoch) 
    private
    returns(uint256 collected)
  {
    uint256 share = user.share[swap][epoch];
    if(share > 0) {
      uint256 fabBalance = token.epochBalance[epoch].fadBalance;
      uint256 totalSupply = token.epochBalance[epoch].totalSupply;

      collected = fabBalance.mul(share).div(totalSupply);
      user.share[swap][epoch] = 0;
      token.epochBalance[epoch].totalSupply = totalSupply.sub(share);
      token.epochBalance[epoch].fadBalance = fabBalance.sub(collected);
    }
  }
}