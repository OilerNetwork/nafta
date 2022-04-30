import hre from "hardhat";

export async function handleEtherscanVerification(address: string, constructorArguments: string[]) {
  const { VERIFY_ON_ETHERSCAN } = process.env;
  if (!VERIFY_ON_ETHERSCAN || VERIFY_ON_ETHERSCAN !== "true") {
    return;
  }

  console.log(`Verifying ${address} contract with following constructor arguments:`);
  console.log(constructorArguments);

  await hre.run("verify:verify", { address, constructorArguments });
}
