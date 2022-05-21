const { expect } = require("chai");
const { constants, time, ether, expectRevert, BN } = require('@openzeppelin/test-helpers');
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
const Token = artifacts.require('TokenMock');

contract('Swap', function([_, wallet1, wallet2, wallet3]) {
  beforeEach(async function() {
    this.USDT = await Token.new('USDT', 'USDT');
    this.WETH = await Token.new('WETH', 'WETH');
    while (this.WETH.address.toLowerCase() > this.USDT.address.toLowerCase()) {
      this.WETH = await Token.new('WETH', 'WETH');
    }
    this.factory = await SwapFactory.new(wallet1, constants.ZERO_ADDRESS, _);
  });
  /*
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
      this.swap = await Swap.at(await this.factory.pools(constants.ZERO_ADDRESS, this.USDT.address));
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
      expect(result).to.be.bignumber.equal(bal.usdt('37.5'));

      const received = await getReceivedTokenAmount(
        this.USDT,
        wallet2,
        () => this.swap.swap(constants.ZERO_ADDRESS, this.USDT.address, bal.eth('1'), bal.zero, constants.ZERO_ADDRESS, { value: bal.eth('1'), from: wallet2 })
      );
      expect(received).to.be.bignumber.equal(bal.usdt('37.5'));
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
      expect(result).to.be.bignumber.equal(bal.usdt('25'));

      const received = await getReceivedTokenAmount(
        this.USDT,
        wallet2,
        () => this.swap.swap(this.WETH.address, this.USDT.address, bal.eth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
      );
      expect(received).to.be.bignumber.equal(bal.usdt('25'));
    });

    
    it('USDT to WETH', async function () {
      const usdtBalanceToAdd = await this.swap.getBalanceToAdd(this.USDT.address);
      const wethBalanceToRemove = await this.swap.getBalanceToRemove(this.WETH.address);
      const result = await this.swap.getQuote(this.USDT.address, this.WETH.address, bal.usdt('100'));
      expect(usdtBalanceToAdd).to.be.bignumber.equal(bal.usdt('100'));
      expect(wethBalanceToRemove).to.be.bignumber.equal(bal.eth('1'));
      expect(result).to.be.bignumber.equal(bal.eth('0.25'));

      const received = await getReceivedTokenAmount(
        this.WETH,
        wallet2,
        () => this.swap.swap(this.USDT.address, this.WETH.address, bal.usdt('150'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
      );
      expect(received).to.be.bignumber.equal(bal.eth('0.24'));
    });

  });
  
  
  describe('Swap with referral support', async function () {
    beforeEach(async function() {
      this.creator = await PoolCreator.new();
      this.factory = await SwapFactory.new(wallet1, this.creator.address, _);
      await this.factory.updateStakeChanged(wallet1, ether('1'));
      await this.factory.defaultVoteSlippageFee('0', { from: wallet1 });
      
      await setBlockTime((await time.latest()).addn(86500));

      await this.factory.deploy(this.WETH.address, this.USDT.address);
      this.swap = await Swap.at(await this.factory.pools(this.WETH.address, this.USDT.address));
      
      await this.USDT.mint(wallet1, new BN('1000'));
      await this.USDT.approve(this.swap.address, new BN('1000'), { from: wallet1 });
      
      await this.WETH.mint(wallet1, new BN('1000'));
      await this.WETH.approve(this.swap.address, new BN('1000'), { from: wallet1 });

      await this.WETH.mint(wallet2, new BN('1000000000000'));
      await this.WETH.approve(this.swap.address, new BN('1000000000000'), { from: wallet2 });

      await this.factory.updateStakeChanged(wallet1, '1');
      await this.factory.defaultVoteFee(bal.weth('0.003'));
    });
    
    it('Referral reward should be 1/10 of value', async function () {
      await this.swap.deposit([new BN('1000'), new BN('1000')], [bal.zero, bal.zero], { from: wallet1 });
      await setBlockTime((await time.latest()).add(await this.swap.getDecayPeriod()));
      await this.swap.swap(this.WETH.address, this.USDT.address, new BN('1000'), bal.zero, wallet3, { from: wallet2 })
      expect(await this.swap.balanceOf(wallet3)).to.be.bignumber.equal('1835');
    });
  });
*/
  describe('Deposits - Withdraws - Swap', async function () {
    beforeEach(async function() {
      this.creator = await PoolCreator.new();
      this.factory = await SwapFactory.new(wallet1, this.creator.address, _);
      await this.factory.updateStakeChanged(wallet1, ether('1'));
      await this.factory.defaultVoteSlippageFee('0', { from: wallet1 });
      
      await setBlockTime((await time.latest()).addn(86500));

      await this.factory.deploy(this.WETH.address, this.USDT.address);
      this.swap = await Swap.at(await this.factory.pools(this.WETH.address, this.USDT.address));
      await this.USDT.mint(wallet1, bal.usdt('100'));
      await this.WETH.mint(wallet1, bal.weth('1'));
      await this.USDT.approve(this.swap.address, bal.usdt('100'), { from: wallet1 });
      await this.WETH.approve(this.swap.address, bal.weth('1'), { from: wallet1 });

      await this.USDT.mint(wallet2, bal.usdt('300'));
      await this.WETH.mint(wallet2, bal.eth('10'));
      await this.USDT.approve(this.swap.address, bal.usdt('300'), { from: wallet2 });
      await this.WETH.approve(this.swap.address, bal.weth('10'), { from: wallet2 });    
    });
    
    /*
    describe('First deposit', async function () {
      it('Amount is zero', async function () {
        await expectRevert(
          this.swap.deposit([bal.weth('0'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 }),
          'SWAP_AMOUNT_IS_ZERO'
        );

        await expectRevert(
          this.swap.deposit([bal.weth('1'), bal.usdt('0')], [bal.zero, bal.zero], { from: wallet1 }),
          'SWAP_AMOUNT_IS_ZERO'
        );
      });

      it('Minimum amount not reached', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });

        await expectRevert(
          this.swap.deposit([bal.weth('1'), bal.usdt('150')], [bal.weth('1').addn(1), bal.usdt('150')], { from: wallet2 }),
          'SWAP_MIN_AMOUNT_NOT_REACHED'
        );

        await expectRevert(
          this.swap.deposit([bal.weth('1'), bal.usdt('150')], [bal.weth('1'), bal.usdt('150').addn(1)], { from: wallet2 }),
          'SWAP_MIN_AMOUNT_NOT_REACHED'
        );
      });

      it('Allow for minimum return with zero', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));
      });

      it('Allow for strict minimum return', async function () {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
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
          this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.usdt('100'), constants.ZERO_ADDRESS, { from: wallet2 }),
          'SWAP_RESULT_NOT_ENOUGH'
        );
      });

      it('50% of token B for 100% of token A: x * y = k', async function () {
        const wethBalanceToAdd = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove = await this.swap.getBalanceToRemove(this.USDT.address);
        const result = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(wethBalanceToAdd).to.be.bignumber.equal(bal.weth('1'));
        expect(usdtBalanceToRemove).to.be.bignumber.equal(bal.usdt('100'));
        expect(result).to.be.bignumber.equal(bal.usdt('25'));

        const received = await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received).to.be.bignumber.equal(bal.eth('25'));
      });

      it('Fail when factory is paused', async function () {
        const wethBalanceToAdd = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove = await this.swap.getBalanceToRemove(this.USDT.address);
        const result = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(wethBalanceToAdd).to.be.bignumber.equal(bal.weth('1'));
        expect(usdtBalanceToRemove).to.be.bignumber.equal(bal.usdt('100'));
        expect(result).to.be.bignumber.equal(bal.usdt('25'));

        await this.factory.shutdown();

        await expectRevert(
          this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 }),
          'SWAP_FACTORY_SHUTDOWN'
        );
      });
      
      it('Additive result for the same swap', async function () {
        const wethBalanceToAdd1 = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove1 = await this.swap.getBalanceToRemove(this.USDT.address);
        const result1 = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('0.6'));
        expect(wethBalanceToAdd1).to.be.bignumber.equal(bal.weth('1'));
        expect(usdtBalanceToRemove1).to.be.bignumber.equal(bal.usdt('100'));
        expect(result1).to.be.bignumber.equal(bal.usdt('23.4375'));

        const received1 = await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('0.6'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received1).to.be.bignumber.equal(bal.usdt('23.4375'));

        const wethBalanceToAdd2 = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove2 = await this.swap.getBalanceToRemove(this.USDT.address);
        const result2 = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1.5'));
        expect(wethBalanceToAdd2).to.be.bignumber.equal(bal.weth('1.6'));
        expect(usdtBalanceToRemove2).to.be.bignumber.equal(bal.usdt('76.5625'));
        expect(result2).to.be.bignumber.equal('19120707596253902184');

        const received2 = await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('0.6'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received2).to.be.bignumber.equal('15185950413223140495');

        expect(received1.add(received2)).to.be.bignumber.equal('38623450413223140495');
      });
      

      it('Should affect reverse price', async function () {
        const wethBalanceToAdd1 = await this.swap.getBalanceToAdd(this.WETH.address);
        const usdtBalanceToRemove1 = await this.swap.getBalanceToRemove(this.USDT.address);
        const result1 = await this.swap.getQuote(this.WETH.address, this.USDT.address, bal.weth('1'));
        expect(wethBalanceToAdd1).to.be.bignumber.equal(bal.weth('1'));
        expect(usdtBalanceToRemove1).to.be.bignumber.equal(bal.usdt('100'));
        expect(result1).to.be.bignumber.equal(bal.usdt('25'));

        const started = (await time.latest()).addn(10);
        await setBlockTime(started);

        const received1 = await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received1).to.be.bignumber.equal(bal.usdt('25'));
        
        // Start of decay period
        const usdtBalanceToAdd2 = await this.swap.getBalanceToAdd(this.USDT.address);
        const wethBalanceToRemove2 = await this.swap.getBalanceToRemove(this.WETH.address);
        const result2 = await this.swap.getQuote(this.USDT.address, this.WETH.address, bal.usdt('100'));
        expect(usdtBalanceToAdd2).to.be.bignumber.equal(bal.usdt('100'));
        expect(wethBalanceToRemove2).to.be.bignumber.equal(bal.weth('1'));
        expect(result2).to.be.bignumber.equal(bal.weth('0.25'));

        await setBlockTime(started.add((await this.swap.getDecayPeriod()).divn(2).addn(1)));

        // Middle of decay period
        const usdtBalanceToAdd3 = await this.swap.getBalanceToAdd(this.USDT.address);
        const wethBalanceToRemove3 = await this.swap.getBalanceToRemove(this.WETH.address);
        const result3 = await this.swap.getQuote(this.USDT.address, this.WETH.address, bal.usdt('100.5'));
        expect(usdtBalanceToAdd3).to.be.bignumber.equal(bal.usdt('87.5'));
        expect(wethBalanceToRemove3).to.be.bignumber.equal(bal.weth('1.5'));
        expect(result3).to.be.bignumber.equal('373206909234947940');

        await setBlockTime(started.add(await this.swap.getDecayPeriod()).addn(1));

        // End of decay period
        const usdtBalanceToAdd4 = await this.swap.getBalanceToAdd(this.USDT.address);
        const wethBalanceToRemove4 = await this.swap.getBalanceToRemove(this.WETH.address);
        const result4 = await this.swap.getQuote(this.USDT.address, this.WETH.address, bal.usdt('150'));
        expect(usdtBalanceToAdd4).to.be.bignumber.equal(bal.usdt('75'));
        expect(wethBalanceToRemove4).to.be.bignumber.equal(bal.weth('2'));
        expect(result4).to.be.bignumber.equal('444444444444444444');

        const received2 = await getReceivedTokenAmount(
          this.WETH,
          wallet2,
          () => this.swap.swap(this.USDT.address, this.WETH.address, bal.usdt('150'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        );
        expect(received1).to.be.bignumber.equal(bal.weth('25'));
      });
      
      it('Multiple cross swap', async function () {
        const started = (await time.latest()).addn(10);
        await setBlockTime(started);

        expect(await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal(bal.usdt('25'));

        await checkBalances(this.swap, this.WETH, bal.weth('2'), bal.weth('2'), bal.weth('1'));
        await checkBalances(this.swap, this.USDT, bal.usdt('75'), bal.usdt('100'), bal.usdt('75'));

        expect(await getReceivedTokenAmount(
          this.WETH,
          wallet2,
          () => this.swap.swap(this.USDT.address, this.WETH.address, bal.usdt('100'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal('254165558901852763');

        await checkBalances(this.swap, this.WETH, '1745834441098147237', bal.weth('2'), '762501107764813903');
        await checkBalances(this.swap, this.USDT, bal.usdt('175'), '199583333333333333333', bal.usdt('75'));

        await setBlockTime(started.add((await this.swap.getDecayPeriod()).divn(2)));

        await checkBalances(this.swap, this.WETH, '1745834441098147237', '1881389405845802043', '1221389996653702792');
        await checkBalances(this.swap, this.USDT, bal.usdt('175'), '188111111111111111110', '121666666666666666666');

        expect(await getReceivedTokenAmount(
          this.USDT,
          wallet2,
          () => this.swap.swap(this.WETH.address, this.USDT.address, bal.weth('1.5'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal('30448781595034063727');

        await checkBalances(this.swap, this.WETH, '3245834441098147237', '3377153313197437831', '1237778885542591681');
        await checkBalances(this.swap, this.USDT, '144551218404965936273', '187701388888888888888', '92884551738299269606');

        expect(await getReceivedTokenAmount(
          this.WETH,
          wallet2,
          () => this.swap.swap(this.USDT.address, this.WETH.address, bal.usdt('175.5'), bal.zero, constants.ZERO_ADDRESS, { from: wallet2 })
        )).to.be.bignumber.equal('317492724294708366');

        await checkBalances(this.swap, this.WETH, '2928341716803438871', '3374964665329116321', '953753753840475907');
        await checkBalances(this.swap, this.USDT, '320051218404965936273', '362482219380823506344', '93745662849410380717');
      });
    });
    */
    
    describe('Deposit after swap', async function () {
      beforeEach(async function() {
        await this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.zero, bal.zero], { from: wallet1 });
        expect(await this.swap.balanceOf(wallet1)).to.be.bignumber.equal(bal.usdt('100'));
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
          () => this.swap.deposit([bal.weth('1'), bal.usdt('100')], [bal.weth('1'), bal.usdt('100')], { from: wallet2 })
        )).to.be.bignumber.equal(bal.usdt('150').addn(1000));
      });
    });
  });
});