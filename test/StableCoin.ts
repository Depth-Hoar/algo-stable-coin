import { expect } from "chai";
import { ethers } from "hardhat";
import { DepositorCoin } from "../typechain-types/DepositorCoin";
import { DepthStable } from "../typechain-types/DepthStable";

describe("DepthStable", function () {
  let ethUsdPrice: number, feeRatePercentage: number;
  let DepthStable: DepthStable;

  this.beforeEach(async () => {
    feeRatePercentage = 3;
    ethUsdPrice = 4000;

    const OracleFactory = await ethers.getContractFactory("Oracle");
    const ethUsdOracle = await OracleFactory.deploy();
    await ethUsdOracle.setPrice(ethUsdPrice);

    const DepthStableFactory = await ethers.getContractFactory("DepthStable");
    DepthStable = await DepthStableFactory.deploy(
      feeRatePercentage,
      ethUsdOracle.address
    );
    await DepthStable.deployed();
  });

  it("Should set fee rate percentage", async function () {
    expect(await DepthStable.feeRatePercentage()).to.equal(feeRatePercentage);
  });

  it("Should allow minting", async function () {
    const ethAmount = 1;
    const expectedMintAmount = ethAmount * ethUsdPrice;

    await DepthStable.mint({
      value: ethers.utils.parseEther(ethAmount.toString()),
    });
    expect(await DepthStable.totalSupply()).to.equal(
      ethers.utils.parseEther(expectedMintAmount.toString())
    );
  });

  describe("With minted tokens", function () {
    let mintAmount: number;

    this.beforeEach(async () => {
      const ethAmount = 1;
      mintAmount = ethAmount * ethUsdPrice;

      await DepthStable.mint({
        value: ethers.utils.parseEther(ethAmount.toString()),
      });
    });

    it("Should allow burning", async function () {
      const remainingDepthStableAmount = 100;
      await DepthStable.burn(
        ethers.utils.parseEther(
          (mintAmount - remainingDepthStableAmount).toString()
        )
      );

      expect(await DepthStable.totalSupply()).to.equal(
        ethers.utils.parseEther(remainingDepthStableAmount.toString())
      );
    });

    it("Should prevent depositing collateral buffer below minimum", async function () {
      const expectedMinimumAmount = 0.1; // 10% one 1 ETH
      const stableCoinCollateralBuffer = 0.05; // less than minimum

      await expect(
        DepthStable.depositCollateralBuffer({
          value: ethers.utils.parseEther(stableCoinCollateralBuffer.toString()),
        })
      ).to.be.revertedWith("STC: Initial collateral ratio not met");
    });

    it("Should allow depositing collateral buffer", async function () {
      const stableCoinCollateralBuffer = 0.5;
      await DepthStable.depositCollateralBuffer({
        value: ethers.utils.parseEther(stableCoinCollateralBuffer.toString()),
      });

      const DepositorCoinFactory = await ethers.getContractFactory(
        "DepositorCoin"
      );
      const DepositorCoin = await DepositorCoinFactory.attach(
        await DepthStable.depositorCoin()
      );

      const newInitialSurplusInUsd = stableCoinCollateralBuffer * ethUsdPrice;
      expect(await DepositorCoin.totalSupply()).to.equal(
        ethers.utils.parseEther(newInitialSurplusInUsd.toString())
      );
    });

    describe("With deposited collateral buffer", function () {
      let stableCoinCollateralBuffer: number;
      let DepositorCoin: DepositorCoin;

      this.beforeEach(async () => {
        stableCoinCollateralBuffer = 0.5;
        await DepthStable.depositCollateralBuffer({
          value: ethers.utils.parseEther(stableCoinCollateralBuffer.toString()),
        });

        const DepositorCoinFactory = await ethers.getContractFactory(
          "DepositorCoin"
        );
        DepositorCoin = await DepositorCoinFactory.attach(
          await DepthStable.depositorCoin()
        );
      });

      it("Should allow withdrawing collateral buffer", async function () {
        const newDepositorTotalSupply =
          stableCoinCollateralBuffer * ethUsdPrice;
        const stableCoinCollateralBurnAmount = newDepositorTotalSupply * 0.2;

        await DepthStable.withdrawCollateralBuffer(
          ethers.utils.parseEther(stableCoinCollateralBurnAmount.toString())
        );

        expect(await DepositorCoin.totalSupply()).to.equal(
          ethers.utils.parseEther(
            (
              newDepositorTotalSupply - stableCoinCollateralBurnAmount
            ).toString()
          )
        );
      });
    });
  });
});