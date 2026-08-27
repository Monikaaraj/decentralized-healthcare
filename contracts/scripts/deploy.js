import hre from "hardhat";

async function main() {
  const MedicalConsent = await hre.ethers.getContractFactory("MedicalConsent");
  const consent = await MedicalConsent.deploy();

  await consent.waitForDeployment();

  console.log("MedicalConsent deployed to:", await consent.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
