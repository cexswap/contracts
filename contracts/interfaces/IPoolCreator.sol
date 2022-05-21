// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../Swap.sol";

/** deploying token pair pools */
interface IPoolCreator {

  function deploy(
    IERC20 token1,
    IERC20 token2,
    string calldata name,
    string calldata symbol,
    address poolOwner
  )
  external returns(Swap pool);
}