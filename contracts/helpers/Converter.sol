// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ISwapFactory.sol";
import "../lib/ERC20Helper.sol";
import "../lib/VirtualBalance.sol";
import "../Swap.sol";


/*
* Base contract for maintaining tokens whitelist
*/
abstract contract Converter is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using ERC20Helper for IERC20;
  using VirtualBalance for VirtualBalance.Data;

  uint256 private constant _ONE = 1e18;
  uint256 private constant _MAX_SPREAD = 0.01e18;
  uint256 private constant _MAX_LIQUIDITY_SHARE = 100;
  IERC20 public immutable cexToken;
  ISwapFactory public immutable swapFactory;
  mapping(IERC20 => bool) public pathWhitelist;

  constructor(IERC20 _cexToken, ISwapFactory _swapFactory) {
    cexToken = _cexToken;
    swapFactory = _swapFactory;
  }

  receive() external payable {
    require(msg.sender != tx.origin, "CONVERTOR_TRANSFER_FORBIDDEN");
  }

  modifier validSpread(Swap swap){
    require(_validateSpread(swap), "CONVERTOR_SPREAD_TOO_HIGH");
    _;
  }

  modifier validPool(Swap swap){
    require(swapFactory.isPool(swap), "CONVERTOR_INVALID_POOL");
    _;
  }

  modifier validPath(IERC20[] memory path){
    require(path.length > 0, "CONVERTOR_MIN_PATH_LENGTH_IS_1");
    require(path.length < 5, "CONVERTOR_MIN_PATH_LENGTH_IS_4");
    require(path[path.length - 1] == cexToken, "CONVERTOR_SWAP_TO_TARGET_TOKEN");

    for(uint256 i = 0; i < path.length; i += 1){
      require(pathWhitelist[path[i]], "CONVERTOR_TOKEN_NOT_WHITELIST");
    }
    _;
  }

  function updatePathWhitelist(IERC20 token, bool status) external onlyOwner
  {
    pathWhitelist[token] = status;
  }

  function _validateSpread(Swap swap)
    internal
    view
    returns(bool)
  {
    IERC20[] memory tokens = swap.getTokens();
    uint256 buyPrice;
    uint256 sellPrice;
    uint256 spotPrice;
    {
      uint256 token0Balance = tokens[0].getBalanceOf(address(swap));
      uint256 token1Balance = tokens[1].getBalanceOf(address(swap));
      uint256 decayPeriod = swap.getDecayPeriod();
      VirtualBalance.Data memory vb; 
      (vb.balance, vb.time) = swap.virtualBalanceToAdd(tokens[0]);
      uint256 token0BalanceToAdd = Math.max(vb.current(decayPeriod, token0Balance), token0Balance);
      (vb.balance, vb.time) = swap.virtualBalanceToAdd(tokens[1]);
      uint256 token1BalanceToAdd = Math.max(vb.current(decayPeriod, token1Balance), token1Balance);
      (vb.balance, vb.time) = swap.virtualBalanceToRemove(tokens[0]);
      uint256 token0BalanceToRemove = Math.min(vb.current(decayPeriod, token0Balance), token0Balance);
      (vb.balance, vb.time) = swap.virtualBalanceToRemove(tokens[1]);
      uint256 token1BalanceToRemove = Math.min(vb.current(decayPeriod, token1Balance), token1Balance);

      buyPrice = _ONE.mul(token1BalanceToAdd).div(token0BalanceToRemove);
      sellPrice = _ONE.mul(token1BalanceToRemove).div(token0BalanceToAdd);
      spotPrice = _ONE.mul(token1Balance).div(token0Balance);
    }

    return buyPrice.sub(sellPrice).mul(_ONE) < _MAX_SPREAD.mul(spotPrice);
  }

  function _getMaxAmountForSwap(IERC20[] memory path, uint256 amount)
    internal
    view
    returns(uint256 srcAmount, uint256 dstAmount)
  {
    srcAmount = amount;
    dstAmount = amount;
    uint256 pathLength = path.length;
    for(uint256 i = 0 ; i < pathLength; i += 1) {
      Swap swap = swapFactory.pools(path[i], path[i+1]);
      uint256 maxCurrentStepAmount = path[i].getBalanceOf(address(swap)).div(_MAX_LIQUIDITY_SHARE);
      if(maxCurrentStepAmount < dstAmount) {
        srcAmount = srcAmount.mul(maxCurrentStepAmount).div(dstAmount);
        dstAmount = maxCurrentStepAmount;
      }
      dstAmount = swap.getQuote(path[i], path[i+1], dstAmount);
    }
  }

  function _swap(IERC20[] memory path, uint256 initialAmount, address payable destination)
    internal
    returns(uint256 amount)
  {
    amount = initialAmount;
    uint256 pathLength = path.length;
    for(uint256 i = 0 ; i < pathLength; i += 1) {
      Swap swap = swapFactory.pools(path[i], path[i+1]);
      require(_validateSpread(swap), "CONVERTOR_SPREAD_TOO_HIGH");
      uint256 value = amount;
      if(!path[i].isNativeToken()){
        path[i].safeApprove(address(swap), amount);
        value = 0;
      }

      if(i + 2 < pathLength) {
        amount = swap.swap{value: value}(path[i], path[i+1], amount, 0, address(0));
      } else {
        amount = swap.swapFor{value: value}(path[i], path[i+1], amount, 0, address(0), destination);
      }
    }

    if(pathLength == 1) {
      path[0].transfer(destination, amount);
    }
  }
}