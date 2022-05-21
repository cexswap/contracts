module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Running deploy script for contract PoolCreator");
  console.log('network id:', await getChainId());

  const poolCreatorDeployment = await deploy('PoolCreator', {
    from: deployer,
    args: [],
  });

  console.log('PoolCreator deployed to:', poolCreatorDeployment.address);
};
