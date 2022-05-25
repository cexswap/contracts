// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../Swap.sol";

interface ISwapFactory is IGovernanceFactory{
  
  /** Returns a pool for tokens pair. 
  * Zero address result means that pool doesn't exist yet 
  */
  function pools(IERC20 token0, IERC20 token1) external view returns(Swap);

  /** If address is currently listed as a swap pool. Otherwise, false */
  function isPool(Swap swap) external view returns(bool);
}