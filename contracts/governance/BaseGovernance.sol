// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/IGovernance.sol";


/*
* Base governance contract with notification logics
*/
abstract contract BaseGovernance is IGovernance {
  address public immutable mothership;

  modifier onlyMothership {
    require(msg.sender == mothership, "BASE_GOV_ONLY_MOTHERSHIP");
    _;
  }

  constructor(address _mothership) {
    mothership = _mothership;
  }


  function updateStakeChanged(address account, uint256 newBalance) external override onlyMothership
  {
    _updateStakeChanged(account, newBalance);
  }

  function updateStakesChanged(address[] calldata accounts, uint256[] calldata newBalances) 
    external
    override 
    onlyMothership
  {
    require(accounts.length == newBalances.length, "BASE_GOV_ARRAY_LENGTH_INVALID");
    for(uint256 i = 0; i < accounts.length; i++) {
      _updateStakeChanged(accounts[i], newBalances[i]);
    }
  }

  function _updateStakeChanged(address account, uint256 newBalance) internal virtual; 
}