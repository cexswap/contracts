// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

library ERC20Helper {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  function isNativeToken(IERC20 token)
    internal
    pure
    returns(bool)
  {
    return address(token) == address(0);
  }

  function getBalanceOf(IERC20 token, address account)
    internal
    view
    returns(uint256)
  {
    if(isNativeToken(token)){
      return account.balance;
    } else {
      return token.balanceOf(account);
    }
  }

  function customTransfer(IERC20 token, address payable to, uint256 amount) internal
  {
    if(amount > 0){
      if(isNativeToken(token)){
        to.transfer(amount);
      } else {
        token.safeTransfer(to, amount);
      }
    }
  }

  function customTransferFrom(IERC20 token, address payable from, address to, uint256 amount) internal
  {
    if(amount > 0){
      if(isNativeToken(token)){
        require(msg.value >= amount, "ERC20Helper_VALUE_NOT_ENOUGH");
        require(from == msg.sender, "ERC20Helper_FROM_NOT_SENDER");
        require(to == address(this), "ERC20Helper_TO_NOT_THIS");
        if(msg.value > amount) {
          //Return the remaining to user
          from.transfer(msg.value.sub(amount));
        }
      } else {
        token.safeTransferFrom(from, to, amount);
      }
    }
  }

  function getSymbol(IERC20 token)
    internal
    view
    returns(string memory)
  {
    if(isNativeToken(token)){
      return "ETH";
    }

    (bool success, bytes memory data) = address(token).staticcall{ gas: 20000}(
      abi.encodeWithSignature("symbol()")
    );

    if(!success){
      (success, data) =  address(token).staticcall{ gas: 20000}(
        abi.encodeWithSignature("SYMBOL()")
      );
    }

    if(success && data.length >= 96) {
      (uint256 offset, uint256 length) = abi.decode(data, (uint256, uint256));
      if(offset == 0x20 && length > 0 && length <= 256) {
        return string(abi.decode(data, (bytes)));
      }
    }

    if(success && data.length == 32) {
      uint length = 0;
      while (length < data.length && data[length] >= 0x20 && data[length] <= 0x7E) {
        length++;
      }

      if(length > 0) {
        bytes memory result = new bytes(length);
        for(uint i = 0; i < length; i++) {
          result[i] = data[i];
        }
        return string(result);
      }
    }

    return _toHex(address(token));
  }

  function _toHex(address token)
    private
    pure
    returns(string memory)
  {
    return _toHex(abi.encodePacked(token));
  }

  function _toHex(bytes memory data)
    private
    pure
    returns(string memory)
  {
    bytes memory str = new bytes(2 + data.length * 2);
    str[0] = "0";
    str[1] = "x";
    uint j = 2;
    for(uint i = 0; i < data.length; i++) {
      uint a = uint8(data[i]) >> 4;
      uint b = uint8(data[i]) & 0x0f;
      str[j++] = bytes1(uint8(a + 48 + (a/10) * 39));
      str[j++] = bytes1(uint8(b + 48 + (b/10) * 39));
    }

    return string(str);
  }

}