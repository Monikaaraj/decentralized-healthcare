import hre from "hardhat";

async function main() {
  console.log("Starting deployment...");

  // 1. Deploy MedicalConsent
  const MedicalConsent = await hre.ethers.getContractFactory("MedicalConsent");
  const consent = await MedicalConsent.deploy();
  await consent.waitForDeployment();
  console.log("MedicalConsent deployed to:", await consent.getAddress());

  // 2. Deploy HealthToken (HLTH)
  const HealthToken = await hre.ethers.getContractFactory("HealthToken");
  const token = await HealthToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("HealthToken deployed to:", tokenAddress);

  // 3. Deploy DataMarketplace (Requires HealthToken address)
  const DataMarketplace = await hre.ethers.getContractFactory("DataMarketplace");
  const marketplace = await DataMarketplace.deploy(tokenAddress);
  await marketplace.waitForDeployment();
  console.log("DataMarketplace deployed to:", await marketplace.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
