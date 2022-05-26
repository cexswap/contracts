const { expect } = require("chai");
const { constants, time, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { setBlockTime, getReceivedTokenAmount } = require('./test-helper');


const PoolCreator = artifacts.require('PoolCreator');
const SwapFactory = artifacts.require('SwapFactory');
const Swap = artifacts.require('Swap');
const FeeCollector = artifacts.require('FeeCollector');
const Token = artifacts.require('TokenMock');

contract('FeeCollector', function([wallet1, wallet2]) {
  before(async function() {
    this.token = await Token.new('My Token', 'MTK');
    this.errorToken = await Token.new('Error Token', 'MTK');
    this.USDT = await Token.new('USDT', 'USDT');
    this.creator = await PoolCreator.new();
  });

  beforeEach(async function() {
    this.factory = await SwapFactory.new(wallet1, this.creator.address, wallet1);
    this.feeCollector = await FeeCollector.new(this.token.address, this.factory.address);
    
    await this.factory.setFeeCollector(this.feeCollector.address);
    await this.feeCollector.updatePathWhitelist(constants.ZERO_ADDRESS, true);
    
    await this.factory.updateStakeChanged(wallet1, '1');
    await this.factory.defaultVoteFee(ether('0.01'));
    
    await setBlockTime((await time.latest()).addn(86500));
    
    await this.factory.deploy(constants.ZERO_ADDRESS, this.USDT.address);
    this.swap = await Swap.at(await this.factory.pools(constants.ZERO_ADDRESS, this.USDT.address));

    await this.factory.deploy(constants.ZERO_ADDRESS, this.token.address);
    this.tokenSwap = await Swap.at(await this.factory.pools(constants.ZERO_ADDRESS, this.token.address));

    await this.USDT.mint(wallet1, ether('5000'));
    await this.USDT.approve(this.swap.address, ether('5000'), { from: wallet1 });
    await this.swap.deposit([ether('1'), ether('500')], ['0', '0'], { value: ether('1'), from: wallet1 });

    await this.token.mint(wallet1, ether('100'));
    await this.token.approve(this.tokenSwap.address, ether('100'), { from: wallet1 });
    await this.tokenSwap.deposit([ether('1'), ether('100')], ['0', '0'], { value: ether('1'), from: wallet1 });

    await setBlockTime((await time.latest()).addn(86500));
  });
  
  
  it('Will receive referral fee', async function () {
    await this.swap.swap(constants.ZERO_ADDRESS, this.USDT.address, ether('0.1'), '0', wallet1, { value: ether('0.1'), from: wallet2 });
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.freezeEpoch(this.swap.address);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.trade(this.swap.address, [constants.ZERO_ADDRESS, this.token.address]);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.trade(this.swap.address, [this.USDT.address, constants.ZERO_ADDRESS, this.token.address]);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    const received = await getReceivedTokenAmount(
      this.token,
      wallet1,
      () => this.feeCollector.claim([this.swap.address])
    );
    expect(received).to.be.bignumber.equal('105530055456189700');

    const { firstUnprocessedEpoch, currentEpoch } = await this.feeCollector.tokenInfo(this.swap.address);
    expect(firstUnprocessedEpoch).to.be.bignumber.equal('1');
    expect(currentEpoch).to.be.bignumber.equal('1');
  });

  it('Claim current epoch success', async function () {
    await this.swap.swap(constants.ZERO_ADDRESS, this.USDT.address, ether('1'), '0', wallet1, { value: ether('1'), from: wallet2 });
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.freezeEpoch(this.swap.address);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.trade(this.swap.address, [constants.ZERO_ADDRESS, this.token.address]);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.trade(this.swap.address, [this.USDT.address, constants.ZERO_ADDRESS, this.token.address]);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    const received = await getReceivedTokenAmount(
      this.token,
      wallet1,
      () => this.feeCollector.claimCurrentEpoch(this.swap.address)
    );
    expect(received).to.be.bignumber.equal('105530055456189700');

    const { firstUnprocessedEpoch, currentEpoch } = await this.feeCollector.tokenInfo(this.swap.address);
    expect(firstUnprocessedEpoch).to.be.bignumber.equal('1');
    expect(currentEpoch).to.be.bignumber.equal('1');
  });

  it('Claim frozen epoch success', async function () {
    await this.swap.swap(constants.ZERO_ADDRESS, this.USDT.address, ether('0.1'), '0', wallet1, { value: ether('0.1'), from: wallet2 });
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.freezeEpoch(this.swap.address);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.trade(this.swap.address, [constants.ZERO_ADDRESS, this.token.address]);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    await this.feeCollector.trade(this.swap.address, [this.USDT.address, constants.ZERO_ADDRESS, this.token.address]);
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));

    const received = await getReceivedTokenAmount(
      this.token,
      wallet1,
      () => this.feeCollector.claimFrozenEpoch(this.swap.address)
    );
    expect(received).to.be.bignumber.equal('105530055456189700');

    const { firstUnprocessedEpoch, currentEpoch } = await this.feeCollector.tokenInfo(this.swap.address);
    expect(firstUnprocessedEpoch).to.be.bignumber.equal('1');
    expect(currentEpoch).to.be.bignumber.equal('1');
  });

  it('Process empty frozen epoch successfully', async function () {
    await this.feeCollector.freezeEpoch(this.swap.address);
    await this.feeCollector.trade(this.swap.address, [constants.ZERO_ADDRESS, this.token.address]);
    const { firstUnprocessedEpoch, currentEpoch } = await this.feeCollector.tokenInfo(this.swap.address);
    expect(firstUnprocessedEpoch).to.be.bignumber.equal('1');
    expect(currentEpoch).to.be.bignumber.equal('1');
  });

  it('Trade first token is not from swap tokens', async function () {
    await this.feeCollector.freezeEpoch(this.swap.address);
    await expectRevert(
      this.feeCollector.trade(this.swap.address, [this.errorToken.address, constants.ZERO_ADDRESS, this.token.address]),
      'Invalid first token'
    );
  });

  it('Can not freeze twice', async function () {
    await this.swap.swap(constants.ZERO_ADDRESS, this.USDT.address, ether('0.1'), '0', wallet1, { value: ether('0.1'), from: wallet2 });
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
    await this.feeCollector.freezeEpoch(this.swap.address);
    await expectRevert(
      this.feeCollector.freezeEpoch(this.swap.address),
      'FEE_COLLECT_PREV_EPOCH_NOT_END'
    );
  });

  it('Spread too high', async function () {
    await this.swap.swap(constants.ZERO_ADDRESS, this.USDT.address, ether('1'), '0', wallet1, { value: ether('1'), from: wallet2 });
    await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
    await this.feeCollector.freezeEpoch(this.swap.address);
    await expectRevert(
      this.feeCollector.freezeEpoch(this.swap.address),
      'CONVERTOR_SPREAD_TOO_HIGH'
    );
  });
});