const hre = require('hardhat');
const { ethers } = hre;

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Running deploy script");
  console.log('network id:', await getChainId());

  const SwapFactory = await ethers.getContractFactory('SwapFactory');
  const FeeCollector = await ethers.getContractFactory('FeeCollector');

  const swapFactoryAddress = (await deployments.get('SwapFactory')).address;
  const feeCollectorAddress = (await deployments.get('FeeCollector')).address;

  const swapFactory = SwapFactory.attach(swapFactoryAddress);
  const feeCollector = FeeCollector.attach(feeCollectorAddress);

  const setGovernanceWalletTxn = await swapFactory.setGovernanceWallet(deployer);
  const setFeeCollectorTxn = await swapFactory.setFeeCollector(feeCollector.address);
  const feeCollectorOwnershipTxn = await feeCollector.transferOwnership(deployer);

  await Promise.all([
      setGovernanceWalletTxn.wait(),
      setFeeCollectorTxn.wait(),
      feeCollectorOwnershipTxn.wait(),
  ]);

  const swapFactoryOwnershipTxn = await swapFactory.transferOwnership(deployer);
  await swapFactoryOwnershipTxn.wait();
 
};
