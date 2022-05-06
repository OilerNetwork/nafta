import { Signer } from "ethers";
import { ethers } from "hardhat";

export async function estimateDeploymentGas(contractFactory: any, signer: Signer, constructorParams: any[]): Promise<number> {
  const contract = new contractFactory(signer);
  const deploymentBytecode = contract.bytecode;
  const deploymentData = contract.interface.encodeDeploy(constructorParams);
  const estimatedGas = await ethers.provider.estimateGas({ data: deploymentBytecode + deploymentData.slice(2) });
  return Number(estimatedGas.toString());
}
