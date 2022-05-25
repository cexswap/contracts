// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/** Describes methods that provide all the information about current governance contract state */
interface IGovernanceFactory {
  
  /** Returns information about mooniswap shares */
  function getShareParameters()
    external 
    view 
    returns(uint256, uint256, address, address);

    /** Initial settings that contract was created */
    function defaults()
    external 
    view 
    returns(uint256, uint256, uint256);

    /** Returns the value of default fee */
    function getDefaultFee()
    external 
    view 
    returns(uint256);

    /** Returns the value of default slippage fee */
    function getDefaultSlippageFee()
    external 
    view 
    returns(uint256);

    /** Returns the value of default decay period */
    function getDefaultDecayPeriod()
    external 
    view 
    returns(uint256);

    /** Returns previous default fee that had place, 
    * current one and time on which this changed 
    */
    function getVirtualDefaultFee()
    external 
    view 
    returns(uint104, uint104, uint48);

    /** Returns previous default slippage fee that had place, 
    * current one and time on which this changed 
    */
    function getVirtualDefaultSlippageFee()
    external 
    view 
    returns(uint104, uint104, uint48);

    /** Returns previous default decay period that had place, 
    * current one and time on which this changed 
    */
    function getVirtualDefaultDecayPeriod()
    external 
    view 
    returns(uint104, uint104, uint48);

    /** Returns the value of referral share */
    function getReferralShare()
    external 
    view 
    returns(uint256);

    /** Returns the value of governance share */
    function getGovernanceShare()
    external 
    view 
    returns(uint256);

    /** Returns the value of governance wallet address */
    function governanceWallet()
    external 
    view 
    returns(address);

    /** Returns the value of fee collector wallet address */
    function feeCollector()
    external 
    view 
    returns(address);

    /** Whether the address is current fee collector or was in the past. */
    function isFeeCollector(address)
    external 
    view 
    returns(bool);

    /** Whether the contract is currently working and wasn't stopped. */
    function isActive()
    external 
    view 
    returns(bool);
}