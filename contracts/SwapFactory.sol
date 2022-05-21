// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPoolCreator.sol";
import "./interfaces/ISwapFactory.sol";
import "./lib/FADERC20.sol";
import "./Swap.sol";
import "./governance/GovernanceFactory.sol";


/*
* contract for maintaining tokens whitelist
*/
contract SwapFactory is ISwapFactory, GovernanceFactory {
  using FADERC20 for IERC20;

  event Deployed(
    Swap indexed swap,
    IERC20 indexed token1,
    IERC20 indexed token2
  );

  IPoolCreator public immutable poolCreator;
  address public immutable poolOwner;
  Swap[] public allPools;
  mapping(Swap => bool) public override isPool; 
  mapping(IERC20 => mapping(IERC20 => Swap)) private _pools; 

  constructor(address _poolOwner, IPoolCreator _poolCreator, address _governanceMothership)
    GovernanceFactory(_governanceMothership)
  {
    poolOwner = _poolOwner;
    poolCreator = _poolCreator;
  }

  function getAllPools() external view returns(Swap[] memory)
  {
    return allPools;
  }

  /// @inheritdoc ISwapFactory
  function pools(IERC20 tokenA, IERC20 tokenB) external view override returns(Swap pool)
  {
    (IERC20 token1, IERC20 token2) = sortTokens(tokenA, tokenB);
    return _pools[token1][token2];
  }

  function deploy(
    IERC20 tokenA,
    IERC20 tokenB
  )
    public returns(Swap pool)
  {
    require(tokenA != tokenB, "SWAP_FACT_DUPLICATE_TOKENS");
    (IERC20 token1, IERC20 token2) = sortTokens(tokenA, tokenB);
    require(_pools[token1][token2] == Swap(address(0)), "SWAP_FACT_POOL_ALREADY_EXISTS");

    string memory symbole1 = token1.getSymbol();
    string memory symbole2 = token2.getSymbol();

    pool = poolCreator.deploy(
      token1, 
      token2, 
      string(abi.encodePacked("FADSWAP Liquidity Pool (", symbole1, "-", symbole2, ")")), 
      string(abi.encodePacked(symbole1, "-", symbole2, "-LP")), 
      poolOwner
    );

    _pools[token1][token2] = pool;
    allPools.push(pool);
    isPool[pool] = true;

    emit Deployed(pool, token1, token2);
  }

  function sortTokens(IERC20 token1, IERC20 token2) public pure returns(IERC20, IERC20)
  {
    if(token1 < token2) {
      return (token1, token2);
    }

    return (token2, token1);
  }
}