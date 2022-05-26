// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./TokenMock.sol";

contract TokenMockDecimal8 is TokenMock {

    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 dec) TokenMock(name, symbol) {
      _decimals = dec;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}