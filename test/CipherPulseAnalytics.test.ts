import { expect } from "chai";
import { ethers } from "hardhat";

describe("CipherPulseAnalytics contract shape", function () {
  it("deploys with owner as an authorized analyst", async function () {
    const [owner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CipherPulseAnalytics");
    const contract = await factory.deploy();

    expect(await contract.owner()).to.equal(owner.address);
    expect(await contract.analysts(owner.address)).to.equal(true);
  });

  it("restricts metric reveal authorization to owner or analyst", async function () {
    const [, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CipherPulseAnalytics");
    const contract = await factory.deploy();

    await expectRevert(contract.connect(stranger).requestMetricReveal(0, 0), "NotAnalyst");
  });

  it("rejects invalid cohorts before touching encrypted state", async function () {
    const factory = await ethers.getContractFactory("CipherPulseAnalytics");
    const contract = await factory.deploy();

    await expectRevert(contract.requestMetricReveal(0, 9), "InvalidCohort");
  });
});

async function expectRevert(action: Promise<unknown>, reason: string) {
  try {
    await action;
    throw new Error("Expected transaction to revert");
  } catch (error) {
    expect((error as Error).message).to.include(reason);
  }
}
