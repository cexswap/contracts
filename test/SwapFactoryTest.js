const { expect } = require("chai");
const { expectRevert } = require('@openzeppelin/test-helpers');


const PoolCreator = artifacts.require('PoolCreator');
const SwapFactory = artifacts.require('SwapFactory');
const Swap = artifacts.require('Swap');
const Token = artifacts.require('TokenMock');

contract('SwapFactory', function([_, wallet1, wallet2]) {
  beforeEach(async function() {
    this.creator = await PoolCreator.new();
    this.factory = await SwapFactory.new(wallet1, this.creator.address, wallet1);
  });
  
  
  describe('Symbol', async function () {
    it('default symbol', async function () {
      const token1 = await Token.new('ETH', 'ETH');
      const token2 = await Token.new('USDT', 'USDT');

      await this.factory.deploy(token1.address, token2.address);
      const pool = await Swap.at(await this.factory.pools(token1.address, token2.address));
      if(token1.address.localeCompare(token2.address, undefined, { sensitivity: 'base'}) < 0) {
        expect(await pool.symbol()).to.be.equal('ETH-USDT-LP');
        expect(await pool.name()).to.be.equal('Liquidity Pool (ETH-USDT)');
      } else {
        expect(await pool.symbol()).to.be.equal('USDT-ETH-LP');
        expect(await pool.name()).to.be.equal('Liquidity Pool (USDT-ETH)');
      }
    });

    it('33 char symbol', async function () {
      const token1 = await Token.new('ETH', '123456789012345678901234567890123');
      const token2 = await Token.new('USDT', 'USDT');

      await this.factory.deploy(token1.address, token2.address);
      const pool = await Swap.at(await this.factory.pools(token1.address, token2.address));
      if(token1.address.localeCompare(token2.address, undefined, { sensitivity: 'base'}) < 0) {
        expect(await pool.symbol()).to.be.equal('123456789012345678901234567890123-USDT-LP');
        expect(await pool.name()).to.be.equal('Liquidity Pool (123456789012345678901234567890123-USDT)');
      } else {
        expect(await pool.symbol()).to.be.equal('USDT-123456789012345678901234567890123-LP');
        expect(await pool.name()).to.be.equal('Liquidity Pool (USDT-123456789012345678901234567890123)');
      }
    });

    it('Token without symbol', async function () {
      const token1 = await Token.new('ETH', '');
      const token2 = await Token.new('USDT', 'USDT');

      await this.factory.deploy(token1.address, token2.address);
      const pool = await Swap.at(await this.factory.pools(token1.address, token2.address));
      if(token1.address.localeCompare(token2.address, undefined, { sensitivity: 'base'}) < 0) {
        expect(await pool.symbol()).to.be.equal(token1.address.toLowerCase() + '-USDT-LP');
        expect(await pool.name()).to.be.equal('Liquidity Pool (' + token1.address.toLowerCase() + '-USDT)');
      } else {
        expect(await pool.symbol()).to.be.equal('USDT-' + token1.address.toLowerCase() + '-LP');
        expect(await pool.name()).to.be.equal('Liquidity Pool (USDT-' + token1.address.toLowerCase() + ')');
      }
    });
  });

  describe('Creation', async function () {
    it('Failed for same token', async function () {
      const token1 = await Token.new('ETH', 'ETH');
      
      await expectRevert(
        this.factory.deploy(token1.address, token1.address),
        'SWAP_FACT_DUPLICATE_TOKENS'
      );
    });

    it('Pool already exists', async function () {
      const token1 = await Token.new('ETH', 'ETH');
      const token2 = await Token.new('USDT', 'USDT');

      await this.factory.deploy(token1.address, token2.address);

      await expectRevert(
        this.factory.deploy(token1.address, token2.address),
        'SWAP_FACT_POOL_ALREADY_EXISTS'
      );

      await expectRevert(
        this.factory.deploy(token2.address, token1.address),
        'SWAP_FACT_POOL_ALREADY_EXISTS'
      );
    });
  });

});