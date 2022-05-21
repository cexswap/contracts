const { constants, time, time: { advanceBlock } } = require('@openzeppelin/test-helpers');

async function setBlockTime (seconds) {
  await network.provider.send("evm_setNextBlockTimestamp", [seconds.toNumber()]);
  await network.provider.send("evm_mine");
}

async function getReceivedTokenAmount (token, wallet, cbPromise) {
  return (await getReceivedTokenAmountAndTrx(token, wallet, cbPromise))[0];
}

async function getReceivedTokenAmountAndTrx (token, wallet, cbPromise) {
  const preBalance = web3.utils.toBN(
    (token === constants.ZERO_ADDRESS)
      ? await web3.eth.getBalance(wallet)
      : await token.balanceOf(wallet)
  );

  let txResult = await cbPromise();
  if(txResult.receipt){
    txResult = txResult.receipt;
  }

  let txFees = web3.utils.toBN('0');
  if(wallet.toLowerCase() === txResult.from.toLowerCase() && token === constants.ZERO_ADDRESS) {
    const receipt = await web3.eth.getTransactionReceipt(txResult.transactionHash);
    txFees = web3.utils.toBN(receipt.gasUsed).mul(web3.utils.toBN(tx.gasPrice));
  }

  const postBalance = web3.utils.toBN(
    (token === constants.ZERO_ADDRESS)
      ? await web3.eth.getBalance(wallet)
      : await token.balanceOf(wallet)
  );

  return [postBalance.sub(preBalance).add(txFees), txResult];
}

module.exports = {
  setBlockTime,
  getReceivedTokenAmount
};