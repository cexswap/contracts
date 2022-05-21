const { TOKEN_ADDRESS } = process.env;

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Running deploy script for contract ReferralFeeReceiver");
  console.log('network id:', await getChainId());

  const tokenAddress = TOKEN_ADDRESS;
  const swapFactoryAddress = (await deployments.get('SwapFactory')).address;

  const referralFeeReceiverDeployment = await deploy('ReferralFeeReceiver', {
    from: deployer,
    args: [tokenAddress, swapFactoryAddress],
  });

  console.log('ReferralFeeReceiver deployed to:', referralFeeReceiverDeployment.address);
};
