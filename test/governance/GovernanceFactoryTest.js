const { expect } = require("chai");
const { time, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { setBlockTime } = require('../test-helper');

const GovernanceFactory = artifacts.require('GovernanceFactory');

contract('GovernanceFactory', function([_, wallet1, wallet2, wallet3]) {
  beforeEach(async function() {
    this.factory = await GovernanceFactory.new(_);
    await this.factory.updateStakeChanged(_, ether('1'));
    await this.factory.updateStakeChanged(wallet3, ether('1'));
  });

  describe('Fee', async function () {
    it('Vote for fee successfully', async function () {
      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal('0');
      await this.factory.defaultVoteFee(ether('0.01'));
      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal('0'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal(ether('0.01'));
    });


    it('Vote for fee failed: too high', async function () {
      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal('0');
      await expectRevert(
        this.factory.defaultVoteFee(ether('0.2')),
        'GOV_FACT_FEE_VOTE_HIGH'
      );
    });

    it('Discard vote for fee successfully', async function () {
      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal('0');
      await this.factory.defaultVoteFee(ether('0.01'));
      await this.factory.discardDefaultFeeVote();
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal('0');
    });

    it('Discard vote for fee on unstake', async function () {
      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal('0');
      await this.factory.defaultVoteFee(ether('0.01'));
      await this.factory.updateStakeChanged(_, '0');
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal('0');
    });
  });

  describe('Slippage Fee', async function () {
    it('Vote for slippage fee successfully', async function () {
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('1'));
      await this.factory.defaultVoteSlippageFee(ether('0.5'));
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('1')); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('0.5'));
    });


    it('Vote for slippage fee failed: too high', async function () {
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('1'));
      await expectRevert(
        this.factory.defaultVoteSlippageFee(ether('2')),
        'GOV_FACT_SLIPPAGE_FEE_VOTE_HIGH'
      );
    });

    it('Discard vote for slippage fee successfully', async function () {
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('1'));
      await this.factory.defaultVoteSlippageFee(ether('0.5'));
      await this.factory.discardDefaultSlippageFeeVote();
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('1'));
    });

    it('Discard vote for slippage fee on transfer', async function () {
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('1'));
      await this.factory.defaultVoteSlippageFee(ether('0.5'));
      await this.factory.updateStakeChanged(_, '0');
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('1'));
    });
  });

  describe('Decay Period', async function () {
    it('Vote for decay period successfully', async function () {
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60');
      await this.factory.defaultVoteDecayPeriod('120');
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('120');
    });


    it('Vote for decay period failed: too high', async function () {
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60');
      await expectRevert(
        this.factory.defaultVoteDecayPeriod(ether('2000')),
        'GOV_FACT_DECAY_PERIOD_VOTE_HIGH'
      );
    });

    it('Vote for decay period failed: too low', async function () {
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60');
      await expectRevert(
        this.factory.defaultVoteDecayPeriod('59'),
        'GOV_FACT_DECAY_PERIOD_VOTE_LOW'
      );
    });

    it('Discard vote for decay period successfully', async function () {
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60');
      await this.factory.defaultVoteDecayPeriod('120');
      await this.factory.discardDefaultDecayPeriodVote();
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60');
    });

    it('Discard vote for decay period on unstake', async function () {
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60');
      await this.factory.defaultVoteDecayPeriod('120');
      await this.factory.updateStakeChanged(_, '0');
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60');
    });
  });

  describe('Referral share', async function () {
    it('Vote for referral share successfully', async function () {
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.1'));
      await this.factory.voteReferralShare(ether('0.05'));
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.1')); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.05'));
    });


    it('Vote for referral share failed: too high', async function () {
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.1'));
      await expectRevert(
        this.factory.voteReferralShare(ether('2000')),
        'GOV_FACT_REFER_SHARE_VOTE_HIGH'
      );
    });

    it('Vote for referral share failed: too low', async function () {
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.1'));
      await expectRevert(
        this.factory.voteReferralShare('100'),
        'GOV_FACT_REFER_SHARE_VOTE_LOW'
      );
    });

    it('Discard vote for referral share successfully', async function () {
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.1'));
      await this.factory.voteReferralShare(ether('0.05'));
      await this.factory.discardReferralShareVote();
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.1'));
    });

    it('Discard vote for referral share on unstake', async function () {
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.1'));
      await this.factory.voteReferralShare(ether('0.05'));
      await this.factory.updateStakeChanged(_, '0');
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.1'));
    });
  });
  
  describe('Governance share', async function () {
    it('Vote for governance share successfully', async function () {
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal('0');
      await this.factory.voteGovernanceShare(ether('0.1'));
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal('0'); //change apply in 24h
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal(ether('0.1'));
    });


    it('Vote for governance share failed: too high', async function () {
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal('0');
      await expectRevert(
        this.factory.voteGovernanceShare(ether('2000')),
        'GOV_FACT_GOV_SHARE_VOTE_HIGH'
      );
    });

    it('Discard vote for governance share successfully', async function () {
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal('0');
      await this.factory.voteGovernanceShare(ether('0.1'));
      await this.factory.discardGovernanceShareVote();
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal('0');
    });

    it('Discard vote for governance share on unstake', async function () {
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal('0');
      await this.factory.voteGovernanceShare(ether('0.1'));
      await this.factory.updateStakeChanged(_, '0');
      await setBlockTime((await time.latest()).addn(86500));
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal('0');
    });
  });
  
  describe('Multiple user', async function () {
    it('3 users', async function () {
      await this.factory.updateStakeChanged(wallet1, ether('1'));
      await this.factory.defaultVoteFee(ether('0.006'), { from: wallet1 });
      await this.factory.defaultVoteSlippageFee(ether('0.5'), { from: wallet1 });
      await this.factory.defaultVoteDecayPeriod('120', { from: wallet1 });
      await this.factory.voteReferralShare(ether('0.06'), { from: wallet1 });
      await this.factory.voteGovernanceShare(ether('0.1'), { from: wallet1 });

      await this.factory.updateStakeChanged(wallet2, ether('1'));
      await this.factory.defaultVoteFee(ether('0.003'), { from: wallet2 });
      await this.factory.defaultVoteSlippageFee(ether('0.6'), { from: wallet2 });
      await this.factory.defaultVoteDecayPeriod('60', { from: wallet2 });
      await this.factory.voteReferralShare(ether('0.07'), { from: wallet2 });
      await this.factory.voteGovernanceShare(ether('0.09'), { from: wallet2 });

      await setBlockTime((await time.latest()).addn(86500));

      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal(ether('0.0045'));
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('0.55'));
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('90');
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.065'));
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal(ether('0.095'));

      await this.factory.defaultVoteFee(ether('0.009'));
      await this.factory.defaultVoteSlippageFee(ether('0.4'));
      await this.factory.defaultVoteDecayPeriod('300');
      await this.factory.voteReferralShare(ether('0.08'));
      await this.factory.voteGovernanceShare(ether('0.05'));

      await setBlockTime((await time.latest()).addn(86500));

      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal(ether('0.006'));
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('0.5'));
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('160');
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.07'));
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal(ether('0.08'));

      await this.factory.updateStakeChanged(wallet1, '0');

      await setBlockTime((await time.latest()).addn(86500));

      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal(ether('0.006'));
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('0.5'));
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('180');
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.075'));
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal(ether('0.07'));

      await this.factory.discardDefaultFeeVote();
      await this.factory.discardDefaultSlippageFeeVote();
      await this.factory.discardDefaultDecayPeriodVote();
      await this.factory.discardReferralShareVote();
      await this.factory.discardGovernanceShareVote();

      await setBlockTime((await time.latest()).addn(86500));

      expect(await this.factory.getDefaultFee()).to.be.bignumber.equal(ether('0.003'));
      expect(await this.factory.getDefaultSlippageFee()).to.be.bignumber.equal(ether('0.6'));
      expect(await this.factory.getDefaultDecayPeriod()).to.be.bignumber.equal('60');
      expect(await this.factory.getReferralShare()).to.be.bignumber.equal(ether('0.07'));
      expect(await this.factory.getGovernanceShare()).to.be.bignumber.equal(ether('0.09'));
    });
  });
});