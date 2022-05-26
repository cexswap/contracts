const { expect } = require("chai");
const { time, ether, expectRevert, constants } = require('@openzeppelin/test-helpers');
const { setBlockTime } = require('../test-helper');

const PoolCreator = artifacts.require('PoolCreator');
const SwapFactory = artifacts.require('SwapFactory');
const Swap = artifacts.require('Swap');
const Token = artifacts.require('TokenMock');

contract('Governance', function([_, wallet1, wallet2]) {
  beforeEach(async function() {
    this.USDT = await Token.new('USDT', 'USDT');
    this.creator = await PoolCreator.new();
    this.factory = await SwapFactory.new(_, this.creator.address, _);

    await this.factory.deploy(constants.ZERO_ADDRESS, this.USDT.address);
    this.swap = await Swap.at(await this.factory.pools(constants.ZERO_ADDRESS, this.USDT.address));
    
    await this.USDT.mint(_, ether('5000'));
    await this.USDT.approve(this.swap.address, ether('5000'));

    await this.swap.deposit([ether('1'), ether('500')], ['0', '0'], { value: ether('1') });
    expect(await this.swap.balanceOf(_)).to.be.bignumber.equal(ether('500'));
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
  });

  describe('Fee', async function () {
    it('Vote for fee successfully', async function () {
      expect(await this.swap.getFee()).to.be.bignumber.equal('0');
      await this.swap.voteFee(ether('0.01'));
      expect(await this.swap.getFee()).to.be.bignumber.equal('0'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getFee()).to.be.bignumber.equal('9999999999999999');
    });


    it('Vote for fee failed: too high', async function () {
      expect(await this.swap.getFee()).to.be.bignumber.equal('0');
      await expectRevert(
        this.swap.voteFee(ether('0.2')),
        'GOV_FEE_VOTE_HIGH'
      );
    });

    it('Discard vote for fee successfully', async function () {
      expect(await this.swap.getFee()).to.be.bignumber.equal('0');
      await this.swap.voteFee(ether('0.01'));
      expect(await this.swap.getFee()).to.be.bignumber.equal('0'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getFee()).to.be.bignumber.equal('9999999999999999');
      await this.swap.discardFeeVote();
      expect(await this.swap.getFee()).to.be.bignumber.equal('9999999999999999'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getFee()).to.be.bignumber.equal('0');
    });

    it('Discard vote for fee on transfer', async function () {
      expect(await this.swap.getFee()).to.be.bignumber.equal('0');
      await this.swap.voteFee(ether('0.01'));
      expect(await this.swap.getFee()).to.be.bignumber.equal('0'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getFee()).to.be.bignumber.equal('9999999999999999');
      await this.swap.transfer(wallet1, ether('500'));
      expect(await this.swap.getFee()).to.be.bignumber.equal('9999999999999999'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getFee()).to.be.bignumber.equal('0');
    });
  });

  describe('Slippage Fee', async function () {
    it('Vote for slippage fee successfully', async function () {
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1'));
      await this.swap.voteSlippageFee(ether('0.5'));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1')); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('0.5'));
    });


    it('Vote for slippage fee failed: too high', async function () {
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1'));
      await expectRevert(
        this.swap.voteSlippageFee(ether('2')),
        'GOV_SLIPPAGE_FEE_VOTE_HIGH'
      );
    });

    it('Discard vote for slippage fee successfully', async function () {
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1'));
      await this.swap.voteSlippageFee(ether('0.5'));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1')); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('0.5'));
      await this.swap.discardSlippageFeeVote();
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('0.5')); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1'));
    });

    it('Discard vote for slippage fee on transfer', async function () {
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1'));
      await this.swap.voteSlippageFee(ether('0.5'));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1')); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('0.5'));
      await this.swap.transfer(wallet1, ether('500'));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('0.5')); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('1'));
    });
  });

  describe('Decay Period', async function () {
    it('Vote for decay period successfully', async function () {
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60');
      await this.swap.voteDecayPeriod('120');
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('119');
    });


    it('Vote for decay period failed: too high', async function () {
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60');
      await expectRevert(
        this.swap.voteDecayPeriod(ether('2000')),
        'GOV_DECAY_PERIOD_VOTE_HIGH'
      );
    });

    it('Vote for decay period failed: too low', async function () {
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60');
      await expectRevert(
        this.swap.voteDecayPeriod('59'),
        'GOV_DECAY_PERIOD_VOTE_LOW'
      );
    });

    it('Discard vote for decay period successfully', async function () {
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60');
      await this.swap.voteDecayPeriod('120');
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('119');
      await this.swap.discardDecayPeriodVote();
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('119'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60');
    });

    it('Discard vote for decay period on transfer', async function () {
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60');
      await this.swap.voteDecayPeriod('130');
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('129');
      await this.swap.transfer(wallet1, ether('500'));
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('129'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('60');
    });
  });
  

  describe('Multiple user', async function () {
    it('3 users', async function () {
      await this.USDT.mint(wallet1, ether('5000'));
      await this.USDT.approve(this.swap.address, ether('5000'), { from: wallet1 });
      await this.swap.deposit([ether('1'), ether('500')], ['0', '0'], { value: ether('1'), from: wallet1 });
      expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal('500000000000000001000');

      await this.swap.voteFee(ether('0.006'), { from: wallet1 });
      await this.swap.voteSlippageFee(ether('0.2'), { from: wallet1 });
      await this.swap.voteDecayPeriod('120', { from: wallet1 });

      await this.USDT.mint(wallet2, ether('5000'));
      await this.USDT.approve(this.swap.address, ether('5000'), { from: wallet2 });
      await this.swap.deposit([ether('1'), ether('500')], ['0', '0'], { value: ether('1'), from: wallet2 });
      expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal('500000000000000001000');

      await this.swap.voteFee(ether('0.003'), { from: wallet2 });
      await this.swap.voteSlippageFee(ether('0.3'), { from: wallet2 });
      await this.swap.voteDecayPeriod('60', { from: wallet2 });

      await setBlockTime((await time.latest()).addn(86500));

      expect(await this.swap.getFee()).to.be.bignumber.equal(ether('0.003'));
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('0.5'));
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('80');

      await this.swap.voteFee(ether('0.009'));
      await this.swap.voteSlippageFee(ether('0.4'));
      await this.swap.voteDecayPeriod('300');

      await setBlockTime((await time.latest()).addn(86500));

      expect(await this.swap.getFee()).to.be.bignumber.equal('5999999999999999');
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal(ether('0.3'));
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('159');

      await this.swap.transfer(wallet1, ether('500'));

      await setBlockTime((await time.latest()).addn(86500));

      expect(await this.swap.getFee()).to.be.bignumber.equal('4999999999999999');
      expect(await this.swap.getSlippageFee()).to.be.bignumber.equal('233333333333333333');
      expect(await this.swap.getDecayPeriod()).to.be.bignumber.equal('99');
    });
  });

  describe('Default changed', async function () {
    it('Default fee changed', async function () {
      await this.factory.updateStakeChanged(_, ether('1'));
      await this.factory.defaultVoteFee(ether('0.01'));

       await setBlockTime((await time.latest()).addn(86500));

       await this.swap.discardFeeVote();
       await setBlockTime((await time.latest()).addn(86500));

       expect(await this.swap.getFee()).to.be.bignumber.equal(ether('0.01'));
    });

    it('Balance decreased', async function () {
      await this.factory.updateStakeChanged(_, ether('1'));
      await this.factory.defaultVoteFee(ether('0.01'));

       await setBlockTime((await time.latest()).addn(86500));

       await this.swap.withdraw(ether('350'), []);
       await setBlockTime((await time.latest()).addn(86500));

       expect(await this.swap.getFee()).to.be.bignumber.equal(ether('0.01'));
    });
  });
});