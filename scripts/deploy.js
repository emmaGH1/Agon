import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance));

  console.log("Deploying AgentBidArena...");
  const AgentBidArena = await hre.ethers.getContractFactory("AgentBidArena");
  const arena = await AgentBidArena.deploy();

  await arena.waitForDeployment();

  const address = await arena.getAddress();
  console.log("AgentBidArena successfully deployed to:", address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
