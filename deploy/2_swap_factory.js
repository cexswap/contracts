module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Running deploy script for contract SwapFactory");
  console.log('network id:', await getChainId());

  const poolCreatorAddress = (await deployments.get('PoolCreator')).address;

  const swapFactoryDeployment = await deploy('SwapFactory', {
    from: deployer,
    args: [deployer, poolCreatorAddress, deployer],
  });

  console.log('SwapFactory deployed to:', swapFactoryDeployment.address);
};
