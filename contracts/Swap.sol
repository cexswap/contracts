// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IFeeCollector.sol";
import "./lib/FADERC20.sol";
import "./lib/SQRT.sol";
import "./lib/VirtualBalance.sol";
import "./governance/Governance.sol";

contract Swap is Governance {
  using SQRT for uint256;
  using SafeMath for uint256;
  using FADERC20 for IERC20;
  using VirtualBalance for VirtualBalance.Data;

  struct Balances {
    uint256 src;
    uint256 dst;
  }

  struct Volumes {
    uint128 confirmed;
    uint128 result;
  }
  
  struct Fees {
    uint256 fee;
    uint256 slippageFee;
  }

  event Error(string reason);

  event Deposited(
    address indexed sender,
    address indexed receiver,
    uint256 share,
    uint256 token0Amount,
    uint256 token1Amount
  );

  event Withdrawn(
    address indexed sender,
    address indexed receiver,
    uint256 share,
    uint256 token0Amount,
    uint256 token1Amount
  );

  event Swapped(
    address indexed sender,
    address indexed receiver,
    address indexed srcToken,
    address dstToken,
    uint256 amount,
    uint256 result,
    uint256 srcBalanceAdded,
    uint256 dstBalanceRemoved,
    address referral
  );

  event Sync(
    uint256 srcBalance,
    uint256 dstBalance,
    uint256 fee,
    uint256 slippageFee,
    uint256 referralShare,
    uint256 governanceShare
  );

  uint256 private constant _BASE_SUPPLY = 1000; // Total supply on first deposit

  IERC20 public immutable token0;
  IERC20 public immutable token1;
  mapping(IERC20 => Volumes) public volumes;
  mapping(IERC20 => VirtualBalance.Data) public virtualBalanceToAdd;
  mapping(IERC20 => VirtualBalance.Data) public virtualBalanceToRemove;

  modifier whenNotShutdown {
    require(governanceFactory.isActive(), "SWAP_FACTORY_SHUTDOWN");
    _;
  }

  constructor(
    IERC20 _token0,
    IERC20 _token1,
    string memory name,
    string memory symbol,
    IGovernanceFactory _governanceFactory
  ) 
    ERC20(name, symbol)
    Governance(_governanceFactory)
  {
    require(bytes(name).length > 0, "SWAP_NAME_EMPTY");
    require(bytes(symbol).length > 0, "SWAP_SYMBOL_EMPTY");
    require(_token0 != _token1, "SWAP_TWO_TOKENS_SAME");
    token0 = _token0;
    token1 = _token1;
  }

  /** Returns pair of tokens as [token0, token1] */
  function getTokens()
    external
    view
    returns(IERC20[] memory tokens)
  {
    tokens = new IERC20[](2);
    tokens[0] = token0;
    tokens[1] = token1;
  }

  function getToken(uint256 position)
    external
    view
    returns(IERC20)
  {
    if(position == 0 ) {
      return token0;
    } else if(position == 1){
      return token1;
    } else {
      revert("SWAP_HAVE_ONLY_TWO_TOKENS");
    }
  }

  function getBalanceToAdd(IERC20 token)
    public
    view
    returns(uint256)
  {
    uint256 balance = token.getBalanceOf(address(this));
    return Math.max(virtualBalanceToAdd[token].current(getDecayPeriod(), balance), balance);
  }

  function getBalanceToRemove(IERC20 token)
    public
    view
    returns(uint256)
  {
    uint256 balance = token.getBalanceOf(address(this));
    return Math.min(virtualBalanceToRemove[token].current(getDecayPeriod(), balance), balance);
  }

  /** Returns how many `dst` tokens will be returned for `amount` of `src` tokens */
  function getQuote(IERC20 src, IERC20 dst, uint256 amount)
    external
    view
    returns(uint256)
  {
    return _getQuote(src, dst, amount, getBalanceToAdd(src), getBalanceToRemove(dst), getFee(), getSlippageFee());
  }

  function deposit(uint256[2] memory maxAmounts, uint256[2] memory minAmounts)
    external
    payable
    returns(uint256 fairSupply, uint256[2] memory receivedAmounts)
  {
    return depositFor(maxAmounts, minAmounts, msg.sender);
  }

  function depositFor(uint256[2] memory maxAmounts, uint256[2] memory minAmounts, address target)
    public
    payable
    nonReentrant
    returns(uint256 fairSupply, uint256[2] memory receivedAmounts)
  {
    IERC20[2] memory _tokens = [token0, token1];
    require(
      msg.value == (_tokens[0].isNativeToken() ? maxAmounts[0] : (_tokens[1].isNativeToken() ? maxAmounts[1] : 0)), 
      "SWAP_WRONG_MSG_VALUE"
    );
    uint256 totalSupply = totalSupply();
    if(totalSupply == 0) {
      fairSupply = _BASE_SUPPLY.mul(99);
      _mint(address(this), _BASE_SUPPLY); // Donate up to 1%

      for(uint i = 0; i < maxAmounts.length; i++) {
        fairSupply = Math.max(fairSupply, maxAmounts[i]);
        require(maxAmounts[i] > 0, "SWAP_AMOUNT_IS_ZERO");
        require(maxAmounts[i] >= minAmounts[i], "SWAP_MIN_AMOUNT_NOT_REACHED");
        _tokens[i].fadTransferFrom(payable(msg.sender), address(this), maxAmounts[i]);
        receivedAmounts[i] = maxAmounts[i];
      }
    } else {
      uint256[2] memory realBalances;
      for(uint i = 0; i < realBalances.length; i++) {
        realBalances[i] = _tokens[i].getBalanceOf(address(this)).sub(_tokens[i].isNativeToken() ? msg.value : 0);
      }

      fairSupply = type(uint256).max;
      for(uint i = 0; i < maxAmounts.length; i++) {
        fairSupply = Math.min(fairSupply, totalSupply.mul(maxAmounts[i]).div(realBalances[i]));
      }
      
      uint256 fairSupplyCached = fairSupply; 
      for(uint i = 0; i < maxAmounts.length; i++) {
        require(maxAmounts[i] > 0, "SWAP_AMOUNT_IS_ZERO");
        uint256 amount = realBalances[i].mul(fairSupplyCached).add(totalSupply - 1).div(totalSupply);
        require(amount >= minAmounts[i], "SWAP_MIN_AMOUNT_NOT_REACHED");
        _tokens[i].fadTransferFrom(payable(msg.sender), address(this), amount);
        receivedAmounts[i] = _tokens[i].getBalanceOf(address(this)).sub(realBalances[i]);
        fairSupply = Math.min(fairSupply, totalSupply.mul(receivedAmounts[i]).div(realBalances[i]));
      }
      
      uint256 _decayPeriod = getDecayPeriod(); // gas saving
      for(uint i = 0; i < maxAmounts.length; i++) {
        virtualBalanceToRemove[_tokens[i]].scale(_decayPeriod, realBalances[i], totalSupply.add(fairSupply), totalSupply);
        virtualBalanceToAdd[_tokens[i]].scale(_decayPeriod, realBalances[i], totalSupply.add(fairSupply), totalSupply);
      }
      
    }

    require(fairSupply > 0, "SWAP_DEPOSIT_RESULT_NOT_ENOUGH");
    _mint(target, fairSupply);

    emit Deposited(msg.sender, target, fairSupply, receivedAmounts[0], receivedAmounts[1]);
  }

  function withdraw(uint256 amount, uint256[] memory minReturns)
    external
    returns(uint256[2] memory withdrawnAmounts)
  {
    return withdrawFor(amount, minReturns, payable(msg.sender));
  }

  /** Withdraws funds from the liquidity pool */
  function withdrawFor(uint256 amount, uint256[] memory minReturns, address payable target)
    public
    nonReentrant
    returns(uint256[2] memory withdrawnAmounts)
  {
    IERC20[2] memory _tokens = [token0, token1];
    uint256 totalSupply = totalSupply();
    uint256 _decayPeriod = getDecayPeriod(); // gas saving
    _burn(msg.sender, amount);

    for(uint i = 0; i < _tokens.length; i++) {
      IERC20 token = _tokens[i];
      uint256 preBalance = token.getBalanceOf(address(this));
      uint256 value = preBalance.mul(amount).div(totalSupply);
      token.fadTransfer(target, value);
      withdrawnAmounts[i] = value;
      require(i >= minReturns.length || value >= minReturns[i], "SWAP_RESULT_NOT_ENOUGH");
      virtualBalanceToRemove[token].scale(_decayPeriod, preBalance, totalSupply.add(amount), totalSupply);
      virtualBalanceToAdd[token].scale(_decayPeriod, preBalance, totalSupply.add(amount), totalSupply);
    }

    emit Withdrawn(msg.sender, target, amount, withdrawnAmounts[0], withdrawnAmounts[1]);
  }

  function swap(IERC20 src, IERC20 dst, uint256 amount, uint256 minReturn, address referral)
    external
    payable
    returns(uint256 result)
  {
    return swapFor(src, dst, amount, minReturn, referral, payable(msg.sender));
  }

  function swapFor(IERC20 src, IERC20 dst, uint256 amount, uint256 minReturn, address referral, address payable receiver)
    public
    payable
    nonReentrant
    whenNotShutdown
    returns(uint256 result)
  {
    require(msg.value == (src.isNativeToken() ? amount : 0), "SWAP_WRONG_MSG_VALUE");
    Balances memory balances = Balances({
      src: src.getBalanceOf(address(this)).sub(src.isNativeToken() ? msg.value : 0),
      dst: dst.getBalanceOf(address(this))
    });

    uint256 confirmed;
    Balances memory virtualBalances;
    Fees memory fees = Fees({
      fee: getFee(),
      slippageFee: getSlippageFee()
    });

    (confirmed, result, virtualBalances) = _doTransfers(src, dst, amount, minReturn, receiver, balances, fees);
    emit Swapped(msg.sender, receiver, address(src), address(dst), confirmed, result, virtualBalances.src, virtualBalances.dst, referral);
    
    _mintRewards(confirmed, result, referral, balances, fees);

    // Overflow of uint128 is desired
    volumes[src].confirmed += uint128(confirmed);
    volumes[src].result += uint128(result);
  }

  function _doTransfers(
    IERC20 src, 
    IERC20 dst, 
    uint256 amount, 
    uint256 minReturn, 
    address payable receiver,
    Balances memory balances,
    Fees memory fees
  )
    private
    returns(uint256 confirmed, uint256 result, Balances memory virtualBalances)
  {
    uint256 _decayPeriod = getDecayPeriod();
    virtualBalances.src = virtualBalanceToAdd[src].current(_decayPeriod, balances.src);
    virtualBalances.src = Math.max(virtualBalances.src, balances.src);
    virtualBalances.dst = virtualBalanceToRemove[dst].current(_decayPeriod, balances.dst);
    virtualBalances.dst = Math.min(virtualBalances.dst, balances.dst);
    src.fadTransferFrom(payable(msg.sender), address(this), amount);
    confirmed = src.getBalanceOf(address(this)).sub(balances.src);
    result = _getQuote(src, dst, confirmed, virtualBalances.src, virtualBalances.dst, fees.fee, fees.slippageFee);
    require(result > 0 && result >= minReturn, "SWAP_RESULT_NOT_ENOUGH");
    dst.fadTransfer(receiver, result);

    // Update virtual balances to the same direction only at imbalanced state
    if(virtualBalances.src != balances.src) {
      virtualBalanceToAdd[src].set(virtualBalances.src.add(confirmed));
    }

    if(virtualBalances.dst != balances.dst) {
      virtualBalanceToRemove[dst].set(virtualBalances.dst.sub(result));
    }

    // Update virtual balances to the opposite direction
    virtualBalanceToRemove[src].update(_decayPeriod, balances.src);
    virtualBalanceToAdd[dst].update(_decayPeriod, balances.dst);
  }

  function _mintRewards(uint256 confirmed, uint256 result, address referral, Balances memory balances, Fees memory fees)
    private 
  {
    (
      uint256 referralShare, 
      uint256 governanceShare, 
      address governanceWallet, 
      address feeCollector
    ) = governanceFactory.getShareParameters(); 

    uint256 referralReward;
    uint256 governanceReward;
    uint256 invariantRatio = uint256(1e36);
    invariantRatio = invariantRatio.mul(balances.src.add(confirmed)).div(balances.src);
    invariantRatio = invariantRatio.mul(balances.dst.sub(result)).div(balances.dst);
    
    if(invariantRatio > 1e36){
      // calculate share only if invariant increased
      invariantRatio = invariantRatio.sqrt();
      uint256 invariantIncrease = totalSupply().mul(invariantRatio.sub(1e18)).div(invariantRatio);
    
      referralReward = (referral != address(0)) ? invariantIncrease.mul(referralShare).div(SwapConstants._FEE_DENOMINATOR) : 0;
      governanceReward = (governanceWallet != address(0)) ? invariantIncrease.mul(governanceShare).div(SwapConstants._FEE_DENOMINATOR) : 0;
      
      if(feeCollector == address(0)) {
        if(referralReward > 0) {
          _mint(referral, referralReward);
        }

        if(governanceReward > 0) {
          _mint(governanceWallet, governanceReward);
        }
      } else if(referralReward > 0 || governanceReward > 0) {
        uint256 length = (referralReward > 0 ? 1 : 0) + (governanceReward > 0 ? 1 : 0);
        address[] memory wallets = new address[](length);
        uint256[] memory rewards = new uint256[](length);

        wallets[0] = referral;
        rewards[0] = referralReward;
        if(governanceReward > 0) {
          wallets[length - 1] = governanceWallet;
          rewards[length - 1] = governanceReward;
        }

        try IFeeCollector(feeCollector).updateRewards(wallets, rewards) {
          _mint(feeCollector, referralReward.add(governanceReward));
        } catch {
          emit Error("Update Rewards Failed");
        }
      }
    }

    emit Sync(balances.src, balances.dst, fees.fee, fees.slippageFee, referralReward, governanceReward);
  }

  /**
    spot_ret = dx * y / x
    uni_ret = dx * y / (x + dx)
    slippage = (spot_ret - uni_ret) / spot_ret
    slippage = dx * dx * y / (x * (x + dx)) / (dx * y / x)
    slippage = dx / (x + dx)
    ret = uni_ret * (1 - slip_fee * slippage)
    ret = dx * y / (x + dx) * (1 - slip_fee * dx / (x + dx))
    ret = dx * y / (x + dx) * (x + dx - slip_fee * dx) / (x + dx)

    x = amount * denominator
    dx = amount * (denominator - fee)
   */
  function _getQuote(
    IERC20 src, 
    IERC20 dst,
    uint256 amount,
    uint256 srcBalance,
    uint256 dstBalance,
    uint256 fee,
    uint256 slippageFee
  )
    internal
    view
    returns(uint256)
  {
    if(src > dst){
      (src, dst) = (dst, src);
    }

    if(amount > 0 && src == token0 && dst == token1) {
      uint256 taxedAmount = amount.sub(amount.mul(fee).div(SwapConstants._FEE_DENOMINATOR));
      uint256 srcBalancePlusTaxedAmount = srcBalance.add(taxedAmount);
      uint256 ret = taxedAmount.mul(dstBalance).div(srcBalancePlusTaxedAmount);
      uint256 feeNumerator = SwapConstants._FEE_DENOMINATOR.mul(srcBalancePlusTaxedAmount).sub(slippageFee.mul(taxedAmount));
      uint256 feeDenominator = SwapConstants._FEE_DENOMINATOR.mul(srcBalancePlusTaxedAmount);

      return ret.mul(feeNumerator).div(feeDenominator);
    }

    return 0;
  }

  /** Allows contract owner to withdraw funds that was send to contract by mistake */
  function rescueFunds(IERC20 token, uint256 amount)
    external
    nonReentrant
    onlyOwner
  {
    uint256 balance0 = token0.getBalanceOf(address(this));
    uint256 balance1 = token1.getBalanceOf(address(this));

    token.fadTransfer(payable(msg.sender), amount);
    require(token0.getBalanceOf(address(this)) >= balance0, "SWAP_RESCUE_DENIED_BAL_0");
    require(token1.getBalanceOf(address(this)) >= balance1, "SWAP_RESCUE_DENIED_BAL_1");
    require(balanceOf(address(this)) >= _BASE_SUPPLY, "SWAP_RESCUE_DENIED_BASE_SUPPLY");
  }
}