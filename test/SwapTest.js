const { expect } = require("chai");
const { constants, time, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { setBlockTime, getReceivedTokenAmount } = require('./test-helper');

async function checkBalances (swap, token, expectedBalance, expectedBalanceToAdd, expectedBalanceToRemove) {
  const balance = await token.balanceOf(swap.address);
  const balanceToAdd = await swap.getBalanceToAdd(token.address);
  const balanceToRemove = await swap.getBalanceToRemove(token.address);
  expect(balance).to.be.bignumber.equal(expectedBalance);
  expect(balanceToAdd).to.be.bignumber.equal(expectedBalanceToAdd);
  expect(balanceToRemove).to.be.bignumber.equal(expectedBalanceToRemove);
}

const bal = {
  ether,
  eth: ether,
  weth: ether,
  usdt: ether,
  zero: ether('0'),
  wei1: ether('0').addn(1),
}

const PoolCreator = artifacts.require('PoolCreator');
const SwapFactory = artifacts.require('SwapFactory');
const Swap = artifacts.require('Swap');
const FeeCollector = artifacts.require('FeeCollector');
const Token = artifacts.require('TokenMock');

contract('Swap', function([_, wallet1, wallet2, wallet3, wallet4]) {
  beforeEach(async function() {
    this.token = await Token.new('My Token', 'MTK');
    this.USDT = await Token.new('USDT', 'USDT');
    this.WETH = await Token.new('WETH', 'WETH');
    while (this.WETH.address.toLowerCase() > this.USDT.address.toLowerCase()) {
      this.WETH = await Token.new('WETH', 'WETH');
    }
    this.factory = await SwapFactory.new(wallet1, constants.ZERO_ADDRESS, _);
  });
  
  
  
  describe('Creation', async function () {
    it('Empty name', async function () {
      await expectRevert(
        Swap.new(this.WETH.address, this.USDT.address, '', 'TNH', this.factory.address),
        'SWAP_NAME_EMPTY'
      );
    });

    it('Empty symbol', async function () {
      await expectRevert(
        Swap.new(this.WETH.address, this.USDT.address, 'TNH', '', this.factory.address),
        'SWAP_SYMBOL_EMPTY'
      );
    });

    it('Duplicate Token symbol', async function () {
      await expectRevert(
        Swap.new(this.USDT.address, this.USDT.address, 'TNH', 'TNH', this.factory.address),
        'SWAP_TWO_TOKENS_SAME'
      );
    });

    it('Success', async function () {
      await Swap.new(this.WETH.address, this.USDT.address, 'WETH-USDT-LP', 'WETH-USDT-LP', this.factory.address);
    });
  });

  describe('Get tokens Information', async function () {
    it('Should return the two tokens', async function () {
      this.swap = await Swap.new(this.WETH.address, this.USDT.address, 'WETH-USDT-LP', 'WETH-USDT-LP', this.factory.address);
      expect(await this.swap.token0()).to.be.equal(this.WETH.address);
      expect(await this.swap.token1()).to.be.equal(this.USDT.address);
      expect(await this.swap.getTokens()).to.have.lengthOf(2);
    });

    it('Should return the token for the given position', async function () {
      this.swap = await Swap.new(this.WETH.address, this.USDT.address, 'WETH-USDT-LP', 'WETH-USDT-LP', this.factory.address);
      expect(await this.swap.getToken(0)).to.be.equal(this.WETH.address);
      expect(await this.swap.getToken(1)).to.be.equal(this.USDT.address);
    });

    it('Wrong index', async function () {
      this.swap = await Swap.new(this.WETH.address, this.USDT.address, 'WETH-USDT-LP', 'WETH-USDT-LP', this.factory.address);
      await expectRevert(this.swap.getToken(2), 'SWAP_HAVE_ONLY_TWO_TOKENS');
    });
  });

  describe('Native Token Swap', async function () {
    beforeEach(async function() {
      this.creator = await PoolCreator.new();
      this.factory = await SwapFactory.new(wallet1, this.creator.address, _);
      await this.factory.updateStakeChanged(wallet1, ether('1'));
      await this.factory.defaultVoteSlippageFee('0', { from: wallet1 });
      
      await setBlockTime((await time.latest()).addn(86500));

      await this.factory.deploy(constants.ZERO_ADDRESS, this.USDT.address);
      const pools = await this.factory.getAllPools();
      expect(pools.length).to.be.equal(1);
      this.swap = await Swap.at(await this.factory.pools(this.USDT.address, constants.ZERO_ADDRESS));
      await this.USDT.mint(wallet1, bal.usdt('150'));
      await this.USDT.approve(this.swap.address, bal.usdt('150'), { from: wallet1 });

      await this.USDT.mint(wallet2, bal.usdt('1500'));
      await this.USDT.approve(this.swap.address, bal.usdt('1500'), { from: wallet2 });
    
      await this.swap.deposit([bal.eth('1'), bal.usdt('150')], [bal.zero, bal.zero], { value: bal.eth('1'), from: wallet1 });
      expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('150'));
      await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
    });

    it('Raw WETH to USDT', async function () {
      const wethBalanceToAdd = await this.swap.getBalanceToAdd(constants.ZERO_ADDRESS);
      const usdtBalanceToRemove = await this.swap.getBalanceToRemove(this.USDT.address);
      const result = await this.swap.getQuote(constants.ZERO_ADDRESS, this.USDT.address, bal.eth('1'));
      expect(wethBalanceToAdd).to.be.bignumber.equal(bal.eth('1'));
      expect(usdtBalanceToRemove).to.be.bignumber.equal(bal.usdt('150'));
      expect(result).to.be.bignumber.equal(bal.usdt('75'));

      const received = await getReceivedTokenAmount(
        this.USDT,
        wallet2,
        () => this.swap.swap(
          constants.ZERO_ADDRESS, 
          this.USDT.address, 
          bal.eth('1'), 
          bal.zero, 
          constants.ZERO_ADDRESS, 
          { value: bal.eth('1'), from: wallet2 }
        )
      );
      expect(received).to.be.bignumber.equal(bal.usdt('75'));
    });

    it('Raw WETH to USDT: Wrong msg.value', async function () {
      await expectRevert(
        this.swap.swap(
          constants.ZERO_ADDRESS, 
          this.USDT.address, 
          bal.eth('1'), 
          bal.zero, 
          constants.ZERO_ADDRESS, 
          { value: bal.zero, from: wallet2 }
        ),
        'SWAP_WRONG_MSG_VALUE'
      );
    });
  });


  describe('Swap without referral', async function () {
    beforeEach(async function() {
      this.creator = await PoolCreator.new();
      this.factory = await SwapFactory.new(wallet1, this.creator.address, _);
      await this.factory.updateStakeChanged(wallet1, ether('1'));
      await this.factory.defaultVoteSlippageFee('0', { from: wallet1 });
      
      await setBlockTime((await time.latest()).addn(86500));

      await this.factory.deploy(this.WETH.address, this.USDT.address);
      this.swap = await Swap.at(await this.factory.pools(this.WETH.address, this.USDT.address));
      await this.USDT.mint(wallet1, bal.usdt('100'));
      await this.WETH.mint(wallet1, bal.eth('1'));
      await this.USDT.approve(this.swap.address, bal.usdt('100'), { from: wallet1 });
      await this.WETH.approve(this.swap.address, bal.eth('1'), { from: wallet1 });

      await this.USDT.mint(wallet2, bal.usdt('1500'));
      await this.WETH.mint(wallet2, bal.eth('1'));
      await this.USDT.approve(this.swap.address, bal.usdt('1500'), { from: wallet2 });
      await this.WETH.approve(this.swap.address, bal.eth('1'), { from: wallet2 });
    
      await this.swap.deposit([bal.eth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
      expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));
      await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
    });

    
    it('WETH to USDT', async function () {
      const wethBalanceToAdd = await this.swap.getBalanceToAdd(this.WETH.address);
      const usdtBalanceToRemove = await this.swap.getBalanceToRemove(this.USDT.address);
      const result = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.eth('1'));
      expect(wethBalanceToAdd).to.be.bignumber.equal(bal.eth('1'));
      expect(usdtBalanceToRemove).to.be.bignumber.equal(bal.usdt('100'));
      expect(result).to.be.bignumber.equal(bal.usdt('50'));

      const received = await getReceivedTokenAmount(
        this.USDT,
        wallet2,
        () => this.swap.swap(this.WETH.address, this.USDT.address, bal.eth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
      );
      expect(received).to.be.bignumber.equal(bal.usdt('50'));
    });
    
    
    it('USDT to WETH', async function () {
      const usdtBalanceToAdd = await this.swap.getBalanceToAdd(this.USDT.address);
      const wethBalanceToRemove = await this.swap.getBalanceToRemove(this.WETH.address);
      const result = await this.swap.getQuote(this.USDT.address, this.WETH.address, bal.usdt('100'));
      expect(usdtBalanceToAdd).to.be.bignumber.equal(bal.usdt('100'));
      expect(wethBalanceToRemove).to.be.bignumber.equal(bal.eth('1'));
      expect(result).to.be.bignumber.equal(bal.eth('0.5'));

      const received = await getReceivedTokenAmount(
        this.WETH,
        wallet2,
        () => this.swap.swap(this.USDT.address, this.WETH.address, bal.usdt('150'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
      );
      expect(received).to.be.bignumber.equal(bal.eth('0.6'));
    });

  });
  
  
  describe('Swap with referral support', async function () {
    beforeEach(async function() {
      this.creator = await PoolCreator.new();
      this.factory = await SwapFactory.new(wallet1, this.creator.address, _);
      await this.factory.updateStakeChanged(wallet1, ether('1'));
      await this.factory.defaultVoteSlippageFee('0', { from: wallet1 });
      await this.factory.voteGovernanceShare(bal.weth('0.01'), { from: wallet1 });

      await setBlockTime((await time.latest()).addn(86500));

      await this.factory.deploy(this.WETH.address, this.USDT.address);
      this.swap = await Swap.at(await this.factory.pools(this.WETH.address, this.USDT.address));
      
      await this.USDT.mint(wallet1, bal.usdt('5000'));
      await this.USDT.approve(this.swap.address, bal.usdt('5000'), { from: wallet1 });
      
      await this.WETH.mint(wallet1, bal.weth('10'));
      await this.WETH.approve(this.swap.address, bal.weth('10'), { from: wallet1 });

      await this.WETH.mint(wallet2, bal.weth('1000000000'));
      await this.WETH.approve(this.swap.address, bal.weth('1000000000'), { from: wallet2 });

      await this.factory.updateStakeChanged(wallet1, ether('1'));
      await this.factory.defaultVoteFee(bal.weth('0.005'));
    });
    
    it('Referral reward should be 1/10 of value', async function () {
      await this.swap.deposit([bal.weth('5'), bal.usdt('1')], [bal.zero, bal.zero], { from: wallet1 });
      await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
      const received = await getReceivedTokenAmount(
        this.USDT,
        wallet2,
        () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1000000000'), bal.zero, wallet3, { from: wallet2 })
      );
      expect(received).to.be.bignumber.equal('999999995000000024');
      expect(await this.swap.balanceOf(wallet3)).to.be.bignumber.equal('49999993');
    });

    it('Governance wallet reward', async function () {
      await this.factory.setGovernanceWallet(wallet3);
      await this.swap.deposit([bal.weth('5'), bal.usdt('1')], [bal.zero, bal.zero], { from: wallet1 });
      await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
      const received = await getReceivedTokenAmount(
        this.USDT,
        wallet2,
        () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1000000000'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
      );
      expect(received).to.be.bignumber.equal('999999995000000024');
      expect(await this.swap.balanceOf(wallet3)).to.be.bignumber.equal('4999999');
    });

    it('Using fee collector', async function () {
      await this.factory.setGovernanceWallet(wallet3);
      this.feeCollector = await FeeCollector.new(this.token.address, this.factory.address);
      await this.factory.setFeeCollector(this.feeCollector.address, { from: _ });
      await this.swap.deposit([bal.weth('5'), bal.usdt('1')], [bal.zero, bal.zero], { from: wallet1 });
      await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
      const received = await getReceivedTokenAmount(
        this.USDT,
        wallet2,
        () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1000000000'), bal.zero, wallet3, { from: wallet2 })
      );
      expect(received).to.be.bignumber.equal('999999995000000024');
      expect(await this.swap.balanceOf(this.feeCollector.address)).to.be.bignumber.equal('54999992');
    });

    it('Wrong fee collector', async function () {
      await this.factory.setGovernanceWallet(wallet3);
      await this.factory.setFeeCollector(wallet4, { from: _ });
      await this.swap.deposit([bal.weth('5'), bal.usdt('1')], [bal.zero, bal.zero], { from: wallet1 });
      await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
      await expectRevert(
        this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1000000000'), bal.zero, wallet3, { from: wallet2 }),
        'function call to a non-contract account'
      );
    });
     
  });
 
 
  describe('Common operations (deposits, withdraws, swap, etc.)', async function () {
    beforeEach(async function() {
      this.creator = await PoolCreator.new();
      this.factory = await SwapFactory.new(wallet1, this.creator.address, _);
      await this.factory.updateStakeChanged(wallet1, ether('1'));
      await this.factory.defaultVoteSlippageFee('0', { from: wallet1 });
      
      await setBlockTime((await time.latest()).addn(86500));

      await this.factory.deploy(this.WETH.address, this.USDT.address);
      await this.factory.deploy(constants.ZERO_ADDRESS, this.USDT.address);
      this.swap = await Swap.at(await this.factory.pools(this.WETH.address, this.USDT.address));
      this.swapRaw = await Swap.at(await this.factory.pools(constants.ZERO_ADDRESS, this.USDT.address));
      await this.USDT.mint(wallet1, bal.usdt('300'));
      await this.WETH.mint(wallet1, bal.weth('10'));
      await this.USDT.approve(this.swap.address, bal.usdt('300'), { from: wallet1 });
      await this.WETH.approve(this.swap.address, bal.weth('10'), { from: wallet1 });

      await this.USDT.mint(wallet2, bal.usdt('300'));
      await this.WETH.mint(wallet2, bal.eth('10'));
      await this.USDT.approve(this.swap.address, bal.usdt('300'), { from: wallet2 });
      await this.WETH.approve(this.swap.address, bal.weth('10'), { from: wallet2 });    
    });
    
     
    describe('First deposit', async function () {
      
      it('Amount is zero', async function () {
        await expectRevert(
          this.swap.deposit([bal.weth('0'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 }),
          'SWAP_DEPOSIT_AMOUNT_IS_ZERO_0'
        );

        await expectRevert(
          this.swap.deposit([bal.weth('1'), bal.usdt('0')], [bal.zero, bal.zero], { from: wallet1 }),
          'SWAP_DEPOSIT_AMOUNT_IS_ZERO_0'
        );

        await expectRevert(
          this.swapRaw.deposit([bal.weth('1'), bal.usdt('0')], [bal.zero, bal.zero], { value: bal.zero, from: wallet1 }),
          'SWAP_DEPOSIT_WRONG_MSG_VALUE'
        );
      });

      it('First: Minimum amount not reached', async function () {
        await expectRevert(
          this.swap.deposit([bal.weth('1'), bal.usdt('150')], [bal.weth('1').addn(1), bal.usdt('150')], { from: wallet2 }),
          'SWAP_DEPOSIT_MIN_AMOUNT_LOW'
        );
        });

      it('Minimum amount not reached', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });

        await expectRevert(
          this.swap.deposit([bal.weth('1'), bal.usdt('150')], [bal.weth('1').addn(1), bal.usdt('150')], { from: wallet2 }),
          'SWAP_DEPOSIT_MIN_AMOUNT_LOW'
        );

        await expectRevert(
          this.swap.deposit([bal.weth('1'), bal.usdt('150')], [bal.weth('1'), bal.usdt('150').addn(1)], { from: wallet2 }),
          'SWAP_DEPOSIT_MIN_AMOUNT_LOW'
        );
      });

      it('Allow for minimum return with zero', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));
      });

      it('One of amount is zero', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        await expectRevert(
          this.swap.deposit([bal.weth('1'), bal.zero], [bal.weth('1'), bal.usdt('150').addn(1)], { from: wallet2 }),
          'SWAP_DEPOSIT_MIN_AMOUNT_LOW'
        );
      });

      it('Allow for strict minimum return', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.weth('1'), bal.usdt('100')], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));
      });

      it('Give the same share for same deposit amount', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));

        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet2 });
        expect(await this.swap.balanceOf(wallet2)).to.be.bignumber.equal(bal.usdt('100').addn(1000));
      });

      it('Give the proportional share for proportional deposit amount', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));

        await this.swap.deposit([bal.weth('10'), bal.usdt('150')], [bal.zero, bal.zero], { from: wallet2 });

        expect(await this.swap.balanceOf(wallet2)).to.be.bignumber.equal(bal.usdt('150').addn(1500));
        expect(await this.swap.totalSupply()).to.be.bignumber.equal('250000000000000002500');
      });
      
      it('Give the right shares for repeated deposit amount', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));

        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.weth('1'), bal.usdt('100')], { from: wallet2 });
        expect(await this.swap.balanceOf(wallet2)).to.be.bignumber.equal(bal.usdt('100').addn(1000));

        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.weth('1'), bal.usdt('100')], { from: wallet2 });
        expect(await this.swap.balanceOf(wallet2)).to.be.bignumber.equal(bal.usdt('200').addn(2000));
      });
       

      it('Give the less share for unbalanced deposit amount', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));

        await this.swap.deposit([bal.weth('1'), bal.usdt('101')], [bal.weth('1'), bal.usdt('100')], { from: wallet2 });
        expect(await this.swap.balanceOf(wallet2)).to.be.bignumber.equal(bal.usdt('100').addn(1000));
        expect(await this.USDT.balanceOf(wallet2)).to.be.bignumber.equal(bal.usdt('200'));
      });
    });
   
   
    describe('Deposits', async function () {
      it('Without dust, mitigated with fair supply is cached', async function () {
        await this.swap.deposit(['73185705953920517', '289638863448966403'], [bal.zero, bal.zero], { from: wallet1 });

        const received = await getReceivedTokenAmount(
          this.USDT,
          this.swap.address,
          () => this.swap.deposit(['73470488055448580', '217583468484493826'], [bal.zero, bal.zero], { from: wallet1 })
        );
        expect(received).to.be.bignumber.equal('217583468484493826');
      });
    });
     
    describe('Swap', async function () {
      beforeEach(async function() {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));
        await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()).addn(10));    
      });
      
     
      it('Can not swap the same token', async function () {
        const result = await this.swap.getQuote(this.WETH.address, this.WETH.address, bal.weth('1'));
        expect(result).to.be.bignumber.equal(bal.zero);

        await expectRevert(
          this.swap.swap(this.WETH.address, this.WETH.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 }),
          'SWAP_RESULT_NOT_ENOUGH'
        );
      });

      it('Fail when minimum amount is too small', async function () {
        await expectRevert(
          this.swap.swap(
            this.WETH.address, 
            this.USDT.address, 
            bal.weth('1'), 
            bal.usdt('100'), 
            constants.ZERO_ADDRESS, 
            { from: wallet2 }
          ),
          'SWAP_RESULT_NOT_ENOUGH'
        );
      });

      it('50% of token B for 100% of token A: x * y = k', async function () {
        const wethBalanceToAdd = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove = await this.swap.getBalanceToRemove(this.USDT.address);
        const result = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(wethBalanceToAdd).to.be.bignumber.equal(bal.weth('1'));
        expect(usdtBalanceToRemove).to.be.bignumber.equal(bal.usdt('100'));
        expect(result).to.be.bignumber.equal(bal.usdt('50'));

        const received = await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received).to.be.bignumber.equal(bal.eth('50'));
      });

      
      it('Fail when factory is paused', async function () {
        const wethBalanceToAdd = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove = await this.swap.getBalanceToRemove(this.USDT.address);
        const result = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(wethBalanceToAdd).to.be.bignumber.equal(bal.weth('1'));
        expect(usdtBalanceToRemove).to.be.bignumber.equal(bal.usdt('100'));
        expect(result).to.be.bignumber.equal(bal.usdt('50'));

        await this.factory.shutdown();

        await expectRevert(
          this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 }),
          'SWAP_FACTORY_SHUTDOWN'
        );
      });
      
      it('Additive result for the same swap', async function () {
        const wethBalanceToAdd1 = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove1 = await this.swap.getBalanceToRemove(this.USDT.address);
        const result1 = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(wethBalanceToAdd1).to.be.bignumber.equal(bal.weth('1'));
        expect(usdtBalanceToRemove1).to.be.bignumber.equal(bal.usdt('100'));
        expect(result1).to.be.bignumber.equal(bal.usdt('50'));

        const received1 = await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('0.6'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received1).to.be.bignumber.equal(bal.usdt('37.5'));

        const wethBalanceToAdd2 = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove2 = await this.swap.getBalanceToRemove(this.USDT.address);
        const result2 = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(wethBalanceToAdd2).to.be.bignumber.equal(bal.weth('1.6'));
        expect(usdtBalanceToRemove2).to.be.bignumber.equal(bal.usdt('62.5'));
        expect(result2).to.be.bignumber.equal('24038461538461538461');

        const received2 = await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received2).to.be.bignumber.equal('24038461538461538461');

        expect(received1.add(received2)).to.be.bignumber.equal('61538461538461538461');
      });
      

      it('Should affect reverse price', async function () {
        const wethBalanceToAdd1 = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove1 = await this.swap.getBalanceToRemove(this.USDT.address);
        const result1 = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(wethBalanceToAdd1).to.be.bignumber.equal(bal.weth('1'));
        expect(usdtBalanceToRemove1).to.be.bignumber.equal(bal.usdt('100'));
        expect(result1).to.be.bignumber.equal(bal.usdt('50'));

        const started = (await time.latest()).addn(10);
        await setBlockTime(started);

        const received1 = await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received1).to.be.bignumber.equal(bal.usdt('50'));
        
        // Start of decay period
        const usdtBalanceToAdd2 = await this.swap.getBalanceToAdd(this.USDT.address);
        const wethBalanceToRemove2 = await this.swap.getBalanceToRemove(this.WETH.address);
        const result2 = await this.swap.getQuote(this.USDT.address, this.WETH.address, bal.usdt('100'));
        expect(usdtBalanceToAdd2).to.be.bignumber.equal(bal.usdt('100'));
        expect(wethBalanceToRemove2).to.be.bignumber.equal(bal.weth('1'));
        expect(result2).to.be.bignumber.equal(bal.weth('0.5'));

        await setBlockTime(started.add((await this.swap.getDecayPeriod()).divn(2).addn(1)));

        // Middle of decay period
        const usdtBalanceToAdd3 = await this.swap.getBalanceToAdd(this.USDT.address);
        const wethBalanceToRemove3 = await this.swap.getBalanceToRemove(this.WETH.address);
        const result3 = await this.swap.getQuote(this.USDT.address, this.WETH.address, bal.usdt('100.5'));
        expect(usdtBalanceToAdd3).to.be.bignumber.equal(bal.usdt('75'));
        expect(wethBalanceToRemove3).to.be.bignumber.equal(bal.weth('1.5'));
        expect(result3).to.be.bignumber.equal('858974358974358974');

        await setBlockTime(started.add(await this.swap.getDecayPeriod()).addn(1));

        // End of decay period
        const usdtBalanceToAdd4 = await this.swap.getBalanceToAdd(this.USDT.address);
        const wethBalanceToRemove4 = await this.swap.getBalanceToRemove(this.WETH.address);
        const result4 = await this.swap.getQuote(this.USDT.address, this.WETH.address, bal.usdt('150'));
        expect(usdtBalanceToAdd4).to.be.bignumber.equal(bal.usdt('50'));
        expect(wethBalanceToRemove4).to.be.bignumber.equal(bal.weth('2'));
        expect(result4).to.be.bignumber.equal(bal.usdt('1.5'));

        const received2 = await getReceivedTokenAmount(
          this.WETH,
          wallet2,
          () => this.swap.swap(this.USDT.address, this.WETH.address, bal.usdt('150'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received1).to.be.bignumber.equal(bal.weth('50'));
      });
      
      
      it('Cross swap', async function () {
        const started = (await time.latest()).addn(10);
        await setBlockTime(started);

        expect(await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal(bal.usdt('50'));

        await checkBalances(this.swap, this.WETH, bal.weth('2'), bal.weth('2'), bal.weth('1'));
        await checkBalances(this.swap, this.USDT, bal.usdt('50'), bal.usdt('100'), bal.usdt('50'));

        expect(await getReceivedTokenAmount(
          this.WETH,
          wallet2,
          () => this.swap.swap(this.USDT.address, this.WETH.address, bal.usdt('100'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal('510460251046025104');

        await checkBalances(this.swap, this.WETH, '1489539748953974896', bal.weth('2'), '506206415620641562');
        await checkBalances(this.swap, this.USDT, bal.usdt('150'), '199166666666666666666', bal.usdt('50'));

        await setBlockTime(started.add((await this.swap.getDecayPeriod()).divn(2)));

        await checkBalances(this.swap, this.WETH, '1489539748953974896', '1761785216178521618', '965095304509530451');
        await checkBalances(this.swap, this.USDT, bal.usdt('150'), '176222222222222222221', '96666666666666666666');

        expect(await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1.5'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal('45338892223270170621');

        await checkBalances(this.swap, this.WETH, '2989539748953974896', '3253277545327754533', '981484193398419340');
        await checkBalances(this.swap, this.USDT, '104661107776729829379', '175402777777777777777', '52994441110063162712');

        expect(await getReceivedTokenAmount(
          this.WETH,
          wallet2,
          () => this.swap.swap(this.USDT.address, this.WETH.address, bal.usdt('175.5'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal('509327829378838241');

        await checkBalances(this.swap, this.WETH, '2480211919575136655', '3248881915388191539', '505623956612173691');
        await checkBalances(this.swap, this.USDT, '280161107776729829379', '349723749944426978637', '53855552221174273823');
      });
    });
    
    
    describe('Deposit after swap', async function () {
      beforeEach(async function() {
        await this.swap.deposit([bal.weth('1'), bal.usdt('270')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('270'));
        await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));    
      });
      
      it('Deposit should not balanced after swap', async function () {
        const started = (await time.latest()).addn(10);
        await setBlockTime(started);
        await this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 });
        await setBlockTime(started.add((await this.swap.getDecayPeriod()).divn(2)));
        
        expect(await getReceivedTokenAmount(
          this.swap,
          wallet2,
          () => this.swap.deposit([bal.weth('2'), bal.usdt('135')], [bal.weth('2'), bal.usdt('135')], { from: wallet2 })
        )).to.be.bignumber.equal(bal.usdt('270').addn(1000));
      });
      
      
      it('Keep rates after imbalanced deposit', async function () {
        const started = (await time.latest()).addn(10);
        await setBlockTime(started);
        await this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 });
        
        await checkBalances(this.swap, this.WETH, bal.weth('2'), bal.weth('2'), bal.weth('1'));
        await checkBalances(this.swap, this.USDT, bal.usdt('135'), bal.usdt('270'), bal.usdt('135'));

        await setBlockTime(started.add((await this.swap.getDecayPeriod()).divn(2)).addn(1));

        await checkBalances(this.swap, this.WETH, bal.weth('2'), bal.weth('2'), bal.weth('1.5'));
        await checkBalances(this.swap, this.USDT, bal.usdt('135'), bal.usdt('202.5'), bal.usdt('135'));
        
        expect(await getReceivedTokenAmount(
          this.swap,
          wallet2,
          () => this.swap.deposit([bal.weth('2'), bal.usdt('135')], [bal.weth('2'), bal.usdt('135')], { from: wallet2 })
        )).to.be.bignumber.equal(bal.usdt('270').addn(1000));

        await checkBalances(this.swap, this.WETH, bal.weth('4'), bal.weth('4'), '3033333333333333332');
        await checkBalances(this.swap, this.USDT, bal.usdt('270'), bal.usdt('400.5'), bal.usdt('270'));
      });
    });

   
    describe('Withdraws', async function () {
      beforeEach(async function() {
        await this.swap.deposit([bal.weth('1'), bal.usdt('300')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('300'));
        await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));    
      });

      it('Withdraw failed result not enough', async function () {
        await expectRevert(
          this.swap.withdraw(bal.usdt('300'), [bal.usdt('3000')], { from: wallet1 }),
          'SWAP_WITHDRAW_RESULT_NOT_ENOUGH'
        );
      });

      it('Can withdraw all amount', async function () {
        await this.swap.withdraw(bal.usdt('300'), [], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('0'));
        expect(await this.WETH.balanceOf(this.swap.address)).to.be.bignumber.equal('4');
        expect(await this.USDT.balanceOf(this.swap.address)).to.be.bignumber.equal('1000');
      });

      it('Can withdraw partially amount', async function () {
        await this.swap.withdraw(bal.usdt('150'), [], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('150'));
        expect(await this.USDT.balanceOf(this.swap.address)).to.be.bignumber.equal(bal.usdt('150').addn(500));
        expect(await this.WETH.balanceOf(this.swap.address)).to.be.bignumber.equal(bal.weth('0.5').addn(2));

        await this.swap.withdraw(bal.usdt('150'), [], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.zero);
        expect(await this.WETH.balanceOf(this.swap.address)).to.be.bignumber.equal('4');
        expect(await this.USDT.balanceOf(this.swap.address)).to.be.bignumber.equal('1000');
      });

      it('Multiple users can withdraw all amount', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('300')], [bal.zero, bal.zero], { from: wallet2 });

        await this.swap.withdraw(bal.usdt('300'), [], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.zero);
        expect(await this.USDT.balanceOf(this.swap.address)).to.be.bignumber.equal(bal.usdt('300').addn(1000));
        expect(await this.WETH.balanceOf(this.swap.address)).to.be.bignumber.equal(bal.weth('1').addn(4));

        await this.swap.withdraw(bal.usdt('300').addn(1000), [], { from: wallet2 });
        expect(await this.swap.balanceOf(wallet2)).to.be.bignumber.equal(bal.zero);
        expect(await this.WETH.balanceOf(this.swap.address)).to.be.bignumber.equal('4');
        expect(await this.USDT.balanceOf(this.swap.address)).to.be.bignumber.equal('1000');
      });
    });
    
    describe('Fees', async function () {
      beforeEach(async function() {
        await this.swap.deposit([bal.weth('1'), bal.usdt('300')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('300'));
        await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));    
      });

      it('Will swap with fee', async function () {
        const result = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(result).to.be.bignumber.equal(bal.usdt('150'));

        await this.swap.voteFee(bal.weth('0.005'), { from: wallet1 });

        await setBlockTime((await time.latest()).addn(86500));

        const result2 = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(result2).to.be.bignumber.equal('149624060150375939925');
        expect(await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal('149624060150375939925');
      });
    });

    describe('Rescue funds', async function () {
      beforeEach(async function() {
        await this.token.mint(this.swap.address, bal.weth('1000'), { from: _ });
        await this.swap.deposit([bal.weth('1'), bal.usdt('300')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.token.balanceOf(this.swap.address)).to.be.bignumber.equal(bal.weth('1000'));
        await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));    
      });

      it('Denied for swap tokens', async function () {
        await expectRevert(
          this.swap.rescueFunds(this.WETH.address, bal.weth('1'), { from: wallet1 }),
          'SWAP_RESCUE_DENIED_BAL_0'
        );

        await expectRevert(
          this.swap.rescueFunds(this.USDT.address, bal.usdt('1'), { from: wallet1 }),
          'SWAP_RESCUE_DENIED_BAL_1'
        );
      });

      it('Withdraw success', async function () {
        expect(await this.token.balanceOf(this.swap.address)).to.be.bignumber.equal(bal.weth('1000'));
        expect(await this.token.balanceOf(wallet1)).to.be.bignumber.equal(bal.weth('0'));

        await this.swap.rescueFunds(this.token.address, bal.weth('100'), { from: wallet1 });

        expect(await this.token.balanceOf(this.swap.address)).to.be.bignumber.equal(bal.weth('900'));
        expect(await this.token.balanceOf(wallet1)).to.be.bignumber.equal(bal.weth('100'));
      });
    });
  });
});