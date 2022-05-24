const { TOKEN_ADDRESS } = process.env;

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Running deploy script for contract FeeCollector");
  console.log('network id:', await getChainId());

  const tokenAddress = TOKEN_ADDRESS;
  const swapFactoryAddress = (await deployments.get('SwapFactory')).address;

  const feeCollectorDeployment = await deploy('FeeCollector', {
    from: deployer,
    args: [tokenAddress, swapFactoryAddress],
  });

  console.log('FeeCollector deployed to:', feeCollectorDeployment.address);
};
