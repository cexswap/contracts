const { constants, time, time: { advanceBlock } } = require('@openzeppelin/test-helpers');
const { promisify } = require('util');

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

async function send(payload) {
  return promisify(web3.currentProvider.send.bind(web3.currentProvider))({
      jsonrpc: '2.0',
      id: new Date().getTime(),
      ...payload,
  });
}

async function countInstructions (txHash, instruction) {
  const trace = await promisify(web3.currentProvider.send.bind(web3.currentProvider))({
      jsonrpc: '2.0',
      method: 'debug_traceTransaction',
      params: [txHash, {}],
      id: new Date().getTime(),
  });

  const str = JSON.stringify(trace);

  if (Array.isArray(instruction)) {
      return instruction.map(instr => {
          return str.split('"' + instr.toUpperCase() + '"').length - 1;
      });
  }

  return str.split('"' + instruction.toUpperCase() + '"').length - 1;
}

async function takeSnapshot () {
  const { result } = await send({ method: 'evm_snapshot', params: [] });
  await advanceBlock();

  return result;
}

async function restoreSnapshot (id) {
  await send({
      method: 'evm_revert',
      params: [id],
  });
  await advanceBlock();
}

module.exports = {
  setBlockTime,
  getReceivedTokenAmount,
  takeSnapshot,
  restoreSnapshot,
  countInstructions
};