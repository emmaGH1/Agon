import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

export default {
  solidity: "0.8.24",
  networks: {
    hardhat: {},
    botchain: {
      url: "https://rpc.bohr.life",
      chainId: 968,
      accounts: process.env.MNEMONIC ? { mnemonic: process.env.MNEMONIC } : [],
    }
  }
};
