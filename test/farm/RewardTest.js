const { expect } = require("chai");
const { time, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { takeSnapshot, restoreSnapshot } = require('../test-helper');

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
const Reward = artifacts.require('Reward');
const Token = artifacts.require('TokenMock');
const TokenMockDecimal8 = artifacts.require('TokenMockDecimal8');

const DAY = 24 * 3600;
const WEEK = 7 * DAY;

const DECIMALS = 18;

const TOKENS_1 = bal.usdt('1');
const TOKENS_20 = bal.usdt('20');
const TOKENS_50 = bal.usdt('50');
const TOKENS_100 = bal.usdt('100');
const TOKENS_1000 = bal.usdt('1000');
const TOKENS_2499 = bal.usdt('2499');
const TOKENS_4499 = bal.usdt('4499');
const TOKENS_5000 = bal.usdt('5000');
const TOKENS_7000 = bal.usdt('7000');
const TOKENS_7499 = bal.usdt('7499');
const TOKENS_27500 = bal.usdt('27500');
const TOKENS_35000 = bal.usdt('35000');

const roundBy1 = bn => bn.div(TOKENS_1).mul(TOKENS_1);

describe('Reward', async function () {
  let _, firstNotifier, secondNotifier, liquidityProvider, stakerOne, stakerTwo, randomStaker;

  // Contracts
  let lpToken,
      firstRewardToken,
      secondRewardToken,
      externalRewardToken,
      reward;

  // Helpers
  let lastSnapshotId;

  beforeEach(async () => {
      /**
       * NOTE: don't inherited "before" and "beforeEach" this can modify the snapshot state
       */
      lastSnapshotId = await takeSnapshot();
  });

  afterEach(async () => {
      await restoreSnapshot(lastSnapshotId);
  });

  before(async () => {
      [_, firstNotifier, secondNotifier, liquidityProvider, stakerOne, stakerTwo, randomStaker] = await web3.eth.getAccounts();

      // Deploy mock tokens
      const token1 = await Token.new('One', 'ONE');
      let token2 = await Token.new('Two', 'TWO');
      while (token2.address.toLowerCase() < token1.address.toLowerCase()) {
          token2 = await Token.new('Two', 'TWO');
      }
      await token1.mint(liquidityProvider, bal.usdt(TOKENS_100));
      await token2.mint(liquidityProvider, bal.usdt(TOKENS_100));

      firstRewardToken = await Token.new('FIRST', 'FIRST');
      secondRewardToken = await Token.new('SECOND', 'SECOND');
      externalRewardToken = await Token.new('External Rewards Token', 'MOAR');
      await firstRewardToken.mint(firstNotifier, TOKENS_35000);
      await secondRewardToken.mint(secondNotifier, TOKENS_7000);
      await externalRewardToken.mint(randomStaker, TOKENS_5000);

      // Deploy Swap
      const creator = await PoolCreator.new();
      const factory = await SwapFactory.new(liquidityProvider, creator.address, liquidityProvider);
      await factory.deploy(token1.address, token2.address);
      lpToken = await Swap.at(await factory.pools(token1.address, token2.address));

      // Fill Swap
      await token1.approve(lpToken.address, TOKENS_100, { from: liquidityProvider });
      await token2.approve(lpToken.address, TOKENS_100, { from: liquidityProvider });

      await lpToken.deposit([TOKENS_100, TOKENS_100], [bal.zero, bal.zero], { from: liquidityProvider });

      // Deploy Reward
      reward = await Reward.new(
          lpToken.address,
          firstRewardToken.address,
          WEEK,
          firstNotifier,
          ether('1'),
          { from: _ },
      );
  });

  describe('Constructor & Settings', () => {
      it('should properly set initial values', async () => {
          // LP and Farming tokens
          expect(await reward.swap()).to.be.equal(lpToken.address);
          expect(await reward.name()).to.be.equal('Farming: Liquidity Pool (ONE-TWO)');
          expect(await reward.symbol()).to.be.equal('farm: ONE-TWO-LP');
          expect(await reward.decimals()).to.be.bignumber.equal(DECIMALS.toString());

          // Token rewards
          const tokenReward = await reward.tokenRewards(0);
          expect(tokenReward.gift).to.be.equal(firstRewardToken.address);
          expect(tokenReward.duration).to.be.bignumber.equal(WEEK.toString());
          expect(tokenReward.rewardDistributor).to.be.equal(firstNotifier);
          expect(tokenReward.endDate).to.be.bignumber.equal('0');
          expect(tokenReward.rate).to.be.bignumber.equal('0');
          expect(tokenReward.lastUpdateTime).to.be.bignumber.equal('0');
          expect(tokenReward.rewardPerToken).to.be.bignumber.equal('0');
      });

      it('should set owner on constructor', async () => {
          const ownerAddress = await reward.owner();
          expect(ownerAddress).to.be.equal(_);
      });
  });

  describe('Function permissions', () => {
      it('only notifier can call updateRewardAmount', async () => {
          const rewardValue = TOKENS_1;
          await firstRewardToken.transfer(reward.address, rewardValue, { from: firstNotifier });

          await expectRevert(
              reward.updateRewardAmount(0, rewardValue, { from: randomStaker }),
              'AREWARD_ONLY_DISTRIBUTOR',
          );
          await reward.updateRewardAmount(0, rewardValue, { from: firstNotifier });
      });

      it('only notifier address can call setRewardDuration', async () => {
          await time.increase(WEEK);
          await expectRevert(
              reward.setRewardDuration(0, WEEK / 2, { from: randomStaker }),
              'AREWARD_ONLY_DISTRIBUTOR',
          );
          await reward.setRewardDuration(0, WEEK / 2, { from: firstNotifier });
      });

      it('only owner address can call setRewardDistributor', async () => {
          await expectRevert(
              reward.setRewardDistributor(0, randomStaker, { from: randomStaker }),
              'Ownable: caller is not the owner',
          );
          await reward.setRewardDistributor(0, randomStaker, { from: _ });
      });
  });

  describe('External Rewards Recovery', () => {
      const amount = TOKENS_5000;

      it('only owner can call externalRewardToken', async () => {
          await externalRewardToken.transfer(reward.address, amount, { from: randomStaker });

          await expectRevert(
              reward.rescueFunds(externalRewardToken.address, amount, { from: randomStaker }),
              'Ownable: caller is not the owner',
          );
          await reward.rescueFunds(externalRewardToken.address, amount, { from: _ });
      });

      it('should revert if recovering more staked tokens than totalSupply', async () => {
          // Stake to increase totalSupply()
          const deposit = TOKENS_100;
          await lpToken.approve(reward.address, deposit, { from: liquidityProvider });
          await reward.stake(deposit, { from: liquidityProvider });

          await expectRevert(
              reward.rescueFunds(lpToken.address, deposit, {
                  from: _,
              }),
              'REWARD_CANT_WITHDRAW_FUNDS',
          );
      });

      it('should recover staked tokens surplus', async () => {
          const tip = TOKENS_1;
          await lpToken.transfer(reward.address, tip, { from: liquidityProvider });
          await reward.rescueFunds(lpToken.address, tip, { from: _ });
          expect(await lpToken.balanceOf(_)).to.be.bignumber.equal(tip);
      });

      it('should revert if recovering gift token', async () => {
          await expectRevert(
              reward.rescueFunds(firstRewardToken.address, amount, {
                  from: _,
              }),
              'REWARD_CANT_RESCUE_GIFT',
          );
      });

      it('should retrieve external token from Reward, reduce contracts balance and increase owners balance', async () => {
          await externalRewardToken.transfer(reward.address, amount, { from: randomStaker });

          const ownerMOARBalanceBefore = await externalRewardToken.balanceOf(_);

          await reward.rescueFunds(externalRewardToken.address, amount, { from: _ });
          const ownerMOARBalanceAfter = await externalRewardToken.balanceOf(_);

          expect(await externalRewardToken.balanceOf(reward.address)).to.be.bignumber.equal(bal.zero);
          expect(ownerMOARBalanceAfter.sub(ownerMOARBalanceBefore)).to.be.bignumber.equal(amount);
      });
  });

  describe('getRewardLastUpdateTime()', () => {
      it('should return 0', async () => {
          expect(await reward.getRewardLastUpdateTime(0)).to.be.bignumber.equal(bal.zero);
      });

      describe('when updated', () => {
          it('should equal current timestamp', async () => {
              const rewardValue = TOKENS_1;
              await firstRewardToken.transfer(reward.address, rewardValue, { from: firstNotifier });

              await reward.updateRewardAmount(0, rewardValue, { from: firstNotifier });

              const cur = await time.latest();
              const lastTimeReward = await reward.getRewardLastUpdateTime(0);

              expect(cur.toString()).to.be.equal(lastTimeReward.toString());
          });
      });
  });

  describe('rewardPerToken()', () => {
      it('should return 0', async () => {
          expect(await reward.getRewardPerToken(0)).to.be.bignumber.equal(bal.zero);
      });

      it('should be > 0', async () => {
          const totalToStake = TOKENS_100;

          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          const totalSupply = await reward.totalSupply();
          expect(totalSupply).to.be.bignumber.equal(totalToStake);

          const rewardValue = TOKENS_5000;
          await firstRewardToken.transfer(reward.address, rewardValue, { from: firstNotifier });
          await reward.updateRewardAmount(0, rewardValue, {
              from: firstNotifier,
          });

          await time.increase(DAY);

          const rewardPerToken = await reward.getRewardPerToken(0);
          expect(rewardPerToken).to.be.bignumber.greaterThan(bal.zero);
      });
  });

  describe('stake()', () => {
      it('staking increases staking balance', async () => {
          const totalToStake = TOKENS_100;
          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });

          const initialStakeBal = await reward.balanceOf(stakerOne);
          const initialLpBal = await lpToken.balanceOf(stakerOne);

          await reward.stake(totalToStake, { from: stakerOne });

          const postStakeBal = await reward.balanceOf(stakerOne);
          const postLpBal = await lpToken.balanceOf(stakerOne);

          expect(postLpBal.add(totalToStake)).to.be.bignumber.equal(initialLpBal);
          expect(postStakeBal.sub(totalToStake)).to.be.bignumber.equal(initialStakeBal);
      });

      it('cannot stake 0', async () => {
          await expectRevert(reward.stake('0'), 'REWARD_CANT_STAKE_ZERO');
      });
  });

  describe('earned()', () => {
      it('should be 0 when not staking', async () => {
          expect(await reward.getAccountEarnedReward(0, stakerOne)).to.be.bignumber.equal(bal.zero);
      });

      it('should be > 0 when staking', async () => {
          const totalToStake = TOKENS_100;
          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          const rewardValue = TOKENS_5000;
          await firstRewardToken.transfer(reward.address, rewardValue, { from: firstNotifier });
          await reward.updateRewardAmount(0, rewardValue, {
              from: firstNotifier,
          });

          await time.increase(DAY);

          const earned = await reward.getAccountEarnedReward(0, stakerOne);

          expect(earned).to.be.bignumber.greaterThan(bal.zero);
      });

      it('rate should increase if new rewards come before DURATION ends', async () => {
          const totalToDistribute = TOKENS_5000;

          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          const tokenRewardInitial = await reward.tokenRewards(0);

          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          const tokenRewardLater = await reward.tokenRewards(0);

          expect(tokenRewardInitial.rate).to.be.bignumber.greaterThan(bal.zero);
          expect(tokenRewardLater.rate).to.be.bignumber.greaterThan(tokenRewardInitial.rate);
      });

      it('rewards token balance should rollover after DURATION', async () => {
          const totalToStake = TOKENS_100;
          const totalToDistribute = TOKENS_5000;

          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          await time.increase(WEEK);
          const earnedFirst = await reward.getAccountEarnedReward(0, stakerOne);

          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          await time.increase(WEEK);
          const earnedSecond = await reward.getAccountEarnedReward(0, stakerOne);

          expect(earnedSecond).to.be.bignumber.equal(earnedFirst.add(earnedFirst));
      });
  });

  describe('getReward()', () => {
      it('should increase rewards token balance', async () => {
          const totalToStake = TOKENS_100;
          const totalToDistribute = TOKENS_5000;

          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          await time.increase(DAY);

          const initialRewardBal = await firstRewardToken.balanceOf(stakerOne);
          const initialEarnedBal = await reward.getAccountEarnedReward(0, stakerOne);
          await reward.getReward(0, { from: stakerOne });
          const postRewardBal = await firstRewardToken.balanceOf(stakerOne);
          const postEarnedBal = await reward.getAccountEarnedReward(0, stakerOne);

          expect(postEarnedBal).to.be.bignumber.lessThan(initialEarnedBal);
          expect(postRewardBal).to.be.bignumber.greaterThan(initialRewardBal);
      });
  });

  describe('setRewardDuration()', () => {
      const days70 = DAY * 70;

      it('should increase rewards duration before starting distribution', async () => {
          const tokenReward = await reward.tokenRewards(0);
          expect(tokenReward.duration).to.be.bignumber.equal(WEEK.toString());

          await reward.setRewardDuration(0, days70, { from: firstNotifier });
          const newTokenReward = await reward.tokenRewards(0);
          expect(newTokenReward.duration).to.be.bignumber.equal(days70.toString());
      });

      it('should revert when setting setRewardDuration before the period has finished', async () => {
          const totalToStake = TOKENS_100;
          const totalToDistribute = TOKENS_5000;

          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          await time.increase(DAY);

          await expectRevert(
              reward.setRewardDuration(0, days70, { from: firstNotifier }),
              'AREWARD_REWARD_ONGOING',
          );
      });

      it('should update when setting setRewardDuration after the period has finished', async () => {
          const totalToStake = TOKENS_100;
          const totalToDistribute = TOKENS_5000;

          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          await time.increase(DAY * 8);

          await reward.setRewardDuration(0, days70, { from: firstNotifier });

          const tokenReward = await reward.tokenRewards(0);
          expect(tokenReward.duration).to.be.bignumber.equal(days70.toString());
      });
  });

  describe('withdraw()', () => {
      it('cannot withdraw if nothing staked', async () => {
          await expectRevert(reward.withdraw(TOKENS_100), 'Burn amount exceeds balance');
      });

      it('should increases lp token balance and decreases staking balance', async () => {
          const totalToStake = TOKENS_100;
          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          const initialStakingTokenBal = await lpToken.balanceOf(stakerOne);
          const initialStakeBal = await reward.balanceOf(stakerOne);

          await reward.withdraw(totalToStake, { from: stakerOne });

          const postStakingTokenBal = await lpToken.balanceOf(stakerOne);
          const postStakeBal = await reward.balanceOf(stakerOne);

          expect(postStakeBal.add(totalToStake)).to.be.bignumber.equal(initialStakeBal);
          expect(initialStakingTokenBal.add(totalToStake)).to.be.bignumber.equal(postStakingTokenBal);
      });

      it('cannot withdraw 0', async () => {
          await expectRevert(reward.withdraw('0'), 'REWARD_CANT_WITHDRAW_ZERO');
      });
  });

  describe('exit()', () => {
      it('should retrieve all earned and increase rewards bal', async () => {
          const totalToStake = TOKENS_100;
          const totalToDistribute = TOKENS_5000;

          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          await time.increase(DAY);

          const initialRewardBal = await firstRewardToken.balanceOf(stakerOne);
          const initialEarnedBal = await reward.getAccountEarnedReward(0, stakerOne);
          await reward.exit({ from: stakerOne });
          const postRewardBal = await firstRewardToken.balanceOf(stakerOne);
          const postEarnedBal = await reward.getAccountEarnedReward(0, stakerOne);

          expect(postEarnedBal).to.be.bignumber.lessThan(initialEarnedBal);
          expect(postEarnedBal).to.be.bignumber.equal(bal.zero);
          expect(postRewardBal).to.be.bignumber.greaterThan(initialRewardBal);
      });
  });

  describe('updateRewardAmount()', () => {
      let localReward;

      before(async () => {
          localReward = await Reward.new(
              lpToken.address,
              firstRewardToken.address,
              WEEK,
              firstNotifier,
              ether('1'),
              { from: _ },
          );
      });

      it('Reverts if the provided reward is greater than the balance.', async () => {
          const rewardValue = TOKENS_1000;
          await firstRewardToken.transfer(localReward.address, rewardValue, { from: firstNotifier });
          await expectRevert(
              localReward.updateRewardAmount(0, rewardValue.add(TOKENS_1), {
                  from: firstNotifier,
              }),
              'AREWARD_REWARD_TOO_BIG',
          );
      });

      it('Reverts if the provided reward is greater than the balance, plus rolled-over balance.', async () => {
          const rewardValue = TOKENS_1000;
          await firstRewardToken.transfer(localReward.address, rewardValue, { from: firstNotifier });
          await localReward.updateRewardAmount(0, rewardValue, {
              from: firstNotifier,
          });
          await firstRewardToken.transfer(localReward.address, rewardValue, { from: firstNotifier });
          // Now take into account any leftover quantity.
          await expectRevert(
              localReward.updateRewardAmount(0, rewardValue.add(TOKENS_1), {
                  from: firstNotifier,
              }),
              'AREWARD_REWARD_TOO_BIG',
          );
      });
  });

  describe('Integration Tests', () => {
      it('stake and claim', async () => {
          // Transfer some LP Tokens to user
          const totalToStake = TOKENS_100;
          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });

          // Stake LP Tokens
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          const totalToDistribute = TOKENS_35000;
          // Transfer Rewards to the RewardsDistributor contract address
          await firstRewardToken.transfer(reward.address, totalToDistribute, { from: firstNotifier });
          await reward.updateRewardAmount(0, totalToDistribute, {
              from: firstNotifier,
          });

          // Period finish should be ~7 days from now
          const tokenReward = await reward.tokenRewards(0);
          const curTimestamp = await time.latest();
          expect(parseInt(tokenReward.endDate.toString(), 10), curTimestamp + DAY * 7);

          // Reward duration is 7 days, so we'll
          // Time travel by 6 days to prevent expiration
          await time.increase(DAY * 6);

          // Reward rate and reward per token
          const tokenRewardAfter = await reward.tokenRewards(0);
          expect(tokenRewardAfter.rate).to.be.bignumber.greaterThan(bal.zero);

          const rewardPerToken = await reward.getRewardPerToken(0);
          expect(rewardPerToken).to.be.bignumber.greaterThan(bal.zero);

          // Make sure we earned in proportion to reward per token
          const rewardRewardsEarned = await reward.getAccountEarnedReward(0, stakerOne);
          expect(rewardRewardsEarned).to.be.bignumber.equal(rewardPerToken.mul(totalToStake).div(TOKENS_1));

          // Make sure after withdrawing, we still have the ~amount of rewardRewards
          // The two values will be a bit different as time has "passed"
          const initialWithdraw = TOKENS_20;
          await reward.withdraw(initialWithdraw, { from: stakerOne });
          expect(await lpToken.balanceOf(stakerOne)).to.be.bignumber.equal(initialWithdraw);

          const rewardRewardsEarnedPostWithdraw = await reward.getAccountEarnedReward(0, stakerOne);
          expect(rewardRewardsEarnedPostWithdraw).to.be.bignumber.greaterThan(bal.zero);

          // Get rewards
          const initialRewardBal = await firstRewardToken.balanceOf(stakerOne);
          await reward.getReward(0, { from: stakerOne });
          const postRewardRewardBal = await firstRewardToken.balanceOf(stakerOne);

          expect(postRewardRewardBal).to.be.bignumber.greaterThan(initialRewardBal);

          // Exit
          const preExitLPBal = await lpToken.balanceOf(stakerOne);
          await reward.exit({ from: stakerOne });
          const postExitLPBal = await lpToken.balanceOf(stakerOne);
          expect(postExitLPBal).to.be.bignumber.greaterThan(preExitLPBal);
      });
  });

  describe('Second gift integration test', () => {
      it('simultaneous gifts for one staker', async () => {
          await reward.addRewardGift(secondRewardToken.address, WEEK, secondNotifier, ether('1'), { from: _ });

          // Transfer some LP Tokens to user
          const totalToStake = TOKENS_100;
          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });

          // Stake LP Tokens
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          const firstRewardAmount = TOKENS_35000;
          await firstRewardToken.transfer(reward.address, firstRewardAmount, { from: firstNotifier });
          await reward.updateRewardAmount(0, firstRewardAmount, {
              from: firstNotifier,
          });

          const secondRewardAmount = TOKENS_7000;
          await secondRewardToken.transfer(reward.address, secondRewardAmount, { from: secondNotifier });
          await reward.updateRewardAmount(1, secondRewardAmount, {
              from: secondNotifier,
          });

          const start = (await time.latest()).add(time.duration.seconds(10));

          await time.increaseTo(start.add(time.duration.days(1)));

          const firstRewardRewardsEarned = await reward.getAccountEarnedReward(0, stakerOne);
          expect(roundBy1(firstRewardRewardsEarned)).to.be.bignumber.equal(TOKENS_5000);

          const secondRewardRewardsEarned = await reward.getAccountEarnedReward(1, stakerOne);
          expect(roundBy1(secondRewardRewardsEarned)).to.be.bignumber.equal(TOKENS_1000);

          const firstRewardBalBefore = await firstRewardToken.balanceOf(stakerOne);
          const secondRewardBalBefore = await secondRewardToken.balanceOf(stakerOne);
          const preExitLPBal = await lpToken.balanceOf(stakerOne);
          await reward.exit({ from: stakerOne });
          const firstRewardBalAfter = await firstRewardToken.balanceOf(stakerOne);
          const secondRewardBalAfter = await secondRewardToken.balanceOf(stakerOne);
          const postExitLPBal = await lpToken.balanceOf(stakerOne);

          expect(roundBy1(firstRewardBalAfter).sub(TOKENS_5000)).to.be.bignumber.equal(firstRewardBalBefore);
          expect(roundBy1(secondRewardBalAfter).sub(TOKENS_1000)).to.be.bignumber.equal(secondRewardBalBefore);
          expect(postExitLPBal.sub(totalToStake)).to.be.bignumber.equal(preExitLPBal);
      });

      it('one gift after another for two stakers', async () => {
          // FIRST REWARD = 35k for 1w
          // 1x: +--------------+ = 20k for 4d + 7.5k for 3d = 27.5k
          // 1x:         +------+ =  0k for 4d + 7.5k for 3d =  7.5k
          //
          // SECOND REWARD = 7k for 1w (after 2 days)
          // 1x:     +--------------+ = 2k for 2d + 2.5k for 5d = 4.5k
          // 1x:         +----------+ = 0k for 2d + 2.5k for 5d = 2.5k
          //

          await reward.addRewardGift(secondRewardToken.address, WEEK, secondNotifier, ether('1'), { from: _ });

          // Transfer some LP Tokens to stakers
          const totalToStake = TOKENS_50;
          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });
          await lpToken.transfer(stakerTwo, totalToStake, { from: liquidityProvider });

          // Stake LP Tokens from staker #1
          await lpToken.approve(reward.address, totalToStake, { from: stakerOne });
          await reward.stake(totalToStake, { from: stakerOne });

          // Notify first reward
          const firstRewardAmount = TOKENS_35000;
          await firstRewardToken.transfer(reward.address, firstRewardAmount, { from: firstNotifier });
          await reward.updateRewardAmount(0, firstRewardAmount, {
              from: firstNotifier,
          });

          const start = (await time.latest()).add(time.duration.seconds(10));

          await time.increaseTo(start.add(time.duration.days(2)));

          // TODO: CHECKS

          const secondRewardAmount = TOKENS_7000;
          await secondRewardToken.transfer(reward.address, secondRewardAmount, { from: secondNotifier });
          await reward.updateRewardAmount(1, secondRewardAmount, {
              from: secondNotifier,
          });

          // TODO: CHECKS

          await time.increaseTo(start.add(time.duration.days(4)));

          // TODO: CHECKS

          // Stake LP Tokens from staker #2
          await lpToken.approve(reward.address, totalToStake, { from: stakerTwo });
          await reward.stake(totalToStake, { from: stakerTwo });

          await time.increaseTo(start.add(time.duration.days(9)));

          // TODO: CHECKS

          const firstRewardRewardsEarnedOne = await reward.getAccountEarnedReward(0, stakerOne);
          const firstRewardRewardsEarnedTwo = await reward.getAccountEarnedReward(0, stakerTwo);
          expect(roundBy1(firstRewardRewardsEarnedOne)).to.be.bignumber.equal(TOKENS_27500);
          expect(roundBy1(firstRewardRewardsEarnedTwo)).to.be.bignumber.equal(TOKENS_7499);

          const secondRewardRewardsEarnedOne = await reward.getAccountEarnedReward(1, stakerOne);
          const secondRewardRewardsEarnedTwo = await reward.getAccountEarnedReward(1, stakerTwo);
          expect(roundBy1(secondRewardRewardsEarnedOne)).to.be.bignumber.equal(TOKENS_4499);
          expect(roundBy1(secondRewardRewardsEarnedTwo)).to.be.bignumber.equal(TOKENS_2499);

          const firstRewardBalBefore = await firstRewardToken.balanceOf(stakerOne);
          const secondRewardBalBefore = await secondRewardToken.balanceOf(stakerOne);
          const preExitLPBal = await lpToken.balanceOf(stakerOne);
          await reward.exit({ from: stakerOne });
          const firstRewardBalAfter = await firstRewardToken.balanceOf(stakerOne);
          const secondRewardBalAfter = await secondRewardToken.balanceOf(stakerOne);
          const postExitLPBal = await lpToken.balanceOf(stakerOne);

          expect(roundBy1(firstRewardBalAfter).sub(TOKENS_27500)).to.be.bignumber.equal(firstRewardBalBefore);
          expect(roundBy1(secondRewardBalAfter).sub(TOKENS_4499)).to.be.bignumber.equal(secondRewardBalBefore);
          expect(postExitLPBal.sub(totalToStake)).to.be.bignumber.equal(preExitLPBal);
      });
  });

  describe('low decimals', () => {
      let localReward;
      let lowDecimalsToken;
      const EXPECTED_REWARD_RATE = '1653439153439153439153439153439153439';
      const EXPECTED_REWARD_RATE_PER_TOKEN_STORED = '16534391534391534';

      before(async () => {
          lowDecimalsToken = await TokenMockDecimal8.new('Low', 'LOW', 8);
          await lowDecimalsToken.mint(firstNotifier, TOKENS_35000);
          localReward = await Reward.new(
              lpToken.address,
              lowDecimalsToken.address,
              WEEK,
              firstNotifier,
              ether('10000000000'),
              { from: _ },
          );
          // Transfer some LP Tokens to user
          const totalToStake = TOKENS_100;
          await lpToken.transfer(stakerOne, totalToStake, { from: liquidityProvider });

          // Stake LP Tokens
          await lpToken.approve(localReward.address, totalToStake, { from: stakerOne });
          await localReward.stake(totalToStake, { from: stakerOne });
      });

      it('Should properly scale', async () => {
          const rewardValue = '100000000000000';
          await lowDecimalsToken.transfer(localReward.address, rewardValue, { from: firstNotifier });
          await localReward.updateRewardAmount(0, rewardValue, { from: firstNotifier });
          let rewardInfo = await localReward.tokenRewards(0);
          expect(rewardInfo.rate).to.be.bignumber.equal(EXPECTED_REWARD_RATE);
          await localReward.updateRewardAmount(0, '0', { from: firstNotifier });
          rewardInfo = await localReward.tokenRewards(0);
          expect(rewardInfo.rewardPerToken).to.be.bignumber.equal(EXPECTED_REWARD_RATE_PER_TOKEN_STORED);
      });

      it('Should work with decimals=1', async () => {
          const oneDecimalToken = await TokenMockDecimal8.new('One', 'ONE', 1);
          await oneDecimalToken.mint(firstNotifier, TOKENS_35000);
          const rewardValue = '10000000';
          await localReward.addRewardGift(oneDecimalToken.address, WEEK, firstNotifier, ether('1').mul(ether('1')).divn(10), { from: _ });
          await oneDecimalToken.transfer(localReward.address, rewardValue, { from: firstNotifier });
          await localReward.updateRewardAmount(1, rewardValue, { from: firstNotifier });
          let rewardInfo = await localReward.tokenRewards(1);
          expect(rewardInfo.rate).to.be.bignumber.equal(EXPECTED_REWARD_RATE);
          await localReward.updateRewardAmount(1, '0', { from: firstNotifier });
          rewardInfo = await localReward.tokenRewards(1);
          expect(rewardInfo.rewardPerToken).to.be.bignumber.equal(EXPECTED_REWARD_RATE_PER_TOKEN_STORED);
      });

      it('Should work with decimals=0', async () => {
          const oneDecimalToken = await TokenMockDecimal8.new('Zero', '0', 0);
          await oneDecimalToken.mint(firstNotifier, TOKENS_35000);
          const rewardValue = '1000000';
          await localReward.addRewardGift(oneDecimalToken.address, WEEK, firstNotifier, ether('1').mul(ether('1')), { from: _ });
          await oneDecimalToken.transfer(localReward.address, rewardValue, { from: firstNotifier });
          await localReward.updateRewardAmount(1, rewardValue, { from: firstNotifier });
          let rewardInfo = await localReward.tokenRewards(1);
          expect(rewardInfo.rate).to.be.bignumber.equal(EXPECTED_REWARD_RATE);
          await localReward.updateRewardAmount(1, '0', { from: firstNotifier });
          rewardInfo = await localReward.tokenRewards(1);
          expect(rewardInfo.rewardPerToken).to.be.bignumber.equal(EXPECTED_REWARD_RATE_PER_TOKEN_STORED);
      });
  });
});
