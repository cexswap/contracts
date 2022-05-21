const { expect } = require("chai");
const { ethers } = require("hardhat");


describe("BalanceHelper", function () {
  
  it("Test total supply zero", async function () {  
    const Contract = await ethers.getContractFactory("BalanceHelper");
    const obj = await Contract.deploy();
    await obj.deployed();
    expect(await obj.totalSupply()).to.equal("0");
  });

  it("Test balance of and address is zero", async function () {
    const accounts = await ethers.getSigners();

    const Contract = await ethers.getContractFactory("BalanceHelper");
    const obj = await Contract.deploy();
    await obj.deployed();
    expect(await obj.balanceOf(accounts[0].address)).to.equal("0");
  });

  it("Test mint success", async function () {
    const accounts = await ethers.getSigners();

    const Contract = await ethers.getContractFactory("$BalanceHelper");
    const obj = await Contract.deploy();
    await obj.deployed();
    await obj.$_mint(accounts[0].address, 18);
    expect(await obj.balanceOf(accounts[0].address)).to.equal("18");
    expect(await obj.totalSupply()).to.equal("18");
  });

  it("Test burn success", async function () {
    const accounts = await ethers.getSigners();

    const Contract = await ethers.getContractFactory("$BalanceHelper");
    const obj = await Contract.deploy();
    await obj.deployed();
    await obj.$_mint(accounts[0].address, 18);
    expect(await obj.balanceOf(accounts[0].address)).to.equal("18");
    expect(await obj.totalSupply()).to.equal("18");

    await obj.$_burn(accounts[0].address, 8);
    expect(await obj.balanceOf(accounts[0].address)).to.equal("10");
    expect(await obj.totalSupply()).to.equal("10");
  });

  it("Test set old balance is the same than new one", async function () {
    const accounts = await ethers.getSigners();

    const Contract = await ethers.getContractFactory("$BalanceHelper");
    const obj = await Contract.deploy();
    await obj.deployed();
    await obj.$_mint(accounts[0].address, 18);
    expect(await obj.balanceOf(accounts[0].address)).to.equal("18");
    expect(await obj.totalSupply()).to.equal("18");

    await obj.$set(accounts[0].address, 18);
    expect(await obj.balanceOf(accounts[0].address)).to.equal("18");
    expect(await obj.totalSupply()).to.equal("18");
  });

  it("Test set successfully", async function () {
    const accounts = await ethers.getSigners();

    const Contract = await ethers.getContractFactory("$BalanceHelper");
    const obj = await Contract.deploy();
    await obj.deployed();
    await obj.$_mint(accounts[0].address, 18);
    expect(await obj.balanceOf(accounts[0].address)).to.equal("18");
    expect(await obj.totalSupply()).to.equal("18");

    await obj.$set(accounts[0].address, 8);
    expect(await obj.balanceOf(accounts[0].address)).to.equal("8");
    expect(await obj.totalSupply()).to.equal("8");
  });
});