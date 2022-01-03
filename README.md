# Pegasys Smart Contracts
[![npm](https://img.shields.io/npm/v/@pollum-io/pegasys-protocol)](https://unpkg.com/@pollum-io/pegasys-protocol@latest/)

This repo contains all of the smart contracts used to run [Pegasys](pegasys.finance). It is also distributed through [NPM](https://www.npmjs.com/package/@pollum-io/pegasys-protocol).

## Deployed Contracts

### Syscoin NEVM:
Factory address: `0x4DFc340487bbec780bA8458e614b732d7226AE8f`

Router address: `0x7ADB6DFDfa745F9aC26155710c6C5eff574525d9`

Migrator address: `0x13517674e6f8794973f70B37CcF06676023E69Cc`

### Syscoin Tanenbaum Testnet:
Factory address: `0xb5Bd357d958A89F5E4904c8C50d42fE7D79A7Add`

Router address: `0xeE194665FCd142001c5E7beC56ECb613D93f5DdD`

Migrator address: `0xcDa164cb93979d714CC8B0D3e1ab829E81469649`
## Running
These contracts are compiled and deployed using [Hardhat](https://hardhat.org/).

To prepare the dev environment, run `yarn install`. To compile the contracts, run `yarn compile`. Yarn is available to install [here](https://classic.yarnpkg.com/en/docs/install/#debian-stable) if you need it.

## Attribution
These contracts were adapted from these Uniswap & Pangolin repos: [exchange-contracts](https://github.com/pangolindex/exchange-contracts), [uniswap-v2-core](https://github.com/Uniswap/uniswap-v2-core), [uniswap-v2-periphery](https://github.com/Uniswap/uniswap-v2-core), and [uniswap-lib](https://github.com/Uniswap/uniswap-lib).
