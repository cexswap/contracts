// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./Swap.sol";

/** Helper contract to deploy pools */
contract PoolCreator {
  
  function deploy(
    IERC20 token1,
    IERC20 token2,
    string calldata name,
    string calldata symbol,
    address poolOwner
  ) external returns(Swap pool)
  {
    pool = new Swap(token1, token2, name, symbol, IGovernanceFactory(msg.sender));
    pool.transferOwnership(poolOwner);
  } 
}