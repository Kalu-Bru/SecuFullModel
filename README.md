# Tokenized Securitization Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg)](https://hardhat.org/)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.0-blue)](https://docs.soliditylang.org/)

> A decentralized lending and securitization system using NFTs and ERC-3475 tokens that enables transparent, on-chain creation of loan-backed securities.

This demonstration is part of the Bachelor Thesis **"Securitisation vs Tokenisation: Can the Blockchain do it better?"** and showcases a prototype of smart contracts application to securitise and trade assets.

## 🎯 Project Overview

SecuModel implements a complete tokenized securitization workflow that:

- **Tokenizes individual loans** as ERC-721 NFTs with on-chain metadata
- **Pools loans into tranches** using the ERC-3475 multi-class token standard
- **Enables fractional investment** in loan-backed securities
- **Automates payment distribution** to investors based on their holdings
- **Provides transparent tracking** of all transactions and ownership

### Key Features

- **Loan Tokenization**: Convert individual loans into ERC-721 NFTs
- **Tranche Creation**: Pool loans into Senior, Mezzanine, and Junior tranches
- **Investment Management**: Buy and sell tranche tokens with stablecoins
- **Payment Processing**: Automated distribution of loan repayments
- **Portfolio Tracking**: Real-time monitoring of investor holdings and returns
- **Transparency**: All loan data and transactions stored on-chain

## 🛠 Technologies Used

- **Solidity ^0.8.0** - Smart contract development
- **Hardhat** - Development environment and testing framework
- **OpenZeppelin Contracts** - Secure smart contract libraries
- **ERC-3475** - Multi-class token standard for tranches
- **Ethers.js** - Ethereum interaction library
- **Express.js** - Web application framework
- **EJS** - Template engine for dynamic web pages
- **Danfo.js** - Data manipulation and analysis

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14.0.0 or later)
- **npm** (v6.0.0 or later)
- **Git**

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Kalu-Bru/SecuModel.git
cd SecuModel
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Local Blockchain

Open a new terminal and start a local Hardhat node:

```bash
npx hardhat node
```

This will start a local blockchain at `http://127.0.0.1:8545` with pre-funded accounts.

### 4. Run the Application

In another terminal, start the web application:

```bash
node src/app.js
```

The application will be available at `http://localhost:3000`.

### 5. Follow the Guided Workflow

Navigate to `http://localhost:3000` and follow the step-by-step demonstration:

1. Deploy Mock Stablecoin Contract
2. Mint Stablecoins to Your Wallet  
3. Deploy LoanNFT Contract
4. Deploy Pool Contract
5. Tokenize Random Loans
6. Retrieve Loan Data
7. Create Investment Tranches
8. Invest in Tranches
9. Check Holdings & Balances
10. Process Borrower Payments
11. Distribute Payments to Investors

## 🧪 Testing Smart Contracts on Remix IDE

For users who want to test the contracts without running the full project, follow this checklist to deploy and test the smart contracts directly on [Remix IDE](https://remix.ethereum.org/):

### Prerequisites for Remix Testing
- Access to [Remix IDE](https://remix.ethereum.org/)
- Basic understanding of smart contract interactions

### Step-by-Step Testing Guide

#### Phase 1: Contract Deployment

- **Copy Contract Code**
  - Navigate to `contracts/TokenTranche.sol`
  - Copy the entire contract code to Remix IDE
  - Ensure you have the OpenZeppelin imports available

- **Deploy MockERC20 Contract**
  - Compile the contracts in Remix (Solidity ^0.8.0)
  - Deploy `MockERC20` contract
  - Note the deployed contract address
  - Verify deployment was successful

- **Deploy LoanNFT Contract** 
  - Deploy `LoanNFT` contract (no constructor parameters needed)
  - Note the deployed contract address
  - Verify you are set as the admin

- **Deploy Pool Contract**
  - Deploy `Pool` contract with parameters:
    - `_loanNFT`: Address of deployed LoanNFT contract
    - `_stablecoin`: Address of deployed MockERC20 contract
  - Note the deployed contract address
  - Verify successful deployment

#### Phase 2: Initial Setup

- **Mint Mock Stablecoins**
  - Call `mint` function on MockERC20 contract
  - Parameters: `to` (your address), `amt` (e.g., 1000000 tokens)
  - Verify your balance increased

- **Check TrancheToken Address**
  - Call `trancheToken` view function on Pool contract
  - Note the automatically deployed TrancheToken contract address

#### Phase 3: Loan Tokenization

- **Create Sample Loans**
  - Call `mint` function on LoanNFT contract with sample data:
    - `to`: Pool contract address
    - `principal`: 100000 (example loan amount)
    - `interestRateBps`: 500 (5% interest rate)
    - `maturityTimestamp`: Future timestamp (e.g., 1735689600)
  - Repeat for at least 6-10 loans with varying parameters
  - Note all tokenIds returned

- **Verify Loan Data**
  - Call `getLoanData` function with various tokenIds
  - Verify loan metadata is stored correctly
  - Check that Pool contract owns the loan NFTs

#### Phase 4: Tranche Creation

- **Create Senior Tranche**
  - Call `createTranche` function on Pool contract:
    - `classId`: 1
    - `loans`: Array of tokenIds [1,2,3]
    - `notional`: Sum of principal amounts for selected loans
    - `rateBps`: 300 (3% return rate)
  - Note the returned seriesId

- **Create Mezzanine Tranche**
  - Call `createTranche` function:
    - `classId`: 2  
    - `loans`: Array of tokenIds [4,5,6]
    - `notional`: Sum of principal amounts
    - `rateBps`: 800 (8% return rate)

- **Create Junior Tranche**
  - Call `createTranche` function:
    - `classId`: 3
    - `loans`: Array of remaining tokenIds
    - `notional`: Sum of principal amounts  
    - `rateBps`: 1200 (12% return rate)

- **Verify Tranche Creation**
  - Call `tranches` view function for each classId/seriesId pair
  - Verify loan assignments and parameters are correct

#### Phase 5: Investment Simulation

- **Approve Stablecoin Spending**
  - Call `approve` function on MockERC20:
    - `spender`: Pool contract address
    - `amount`: Amount you want to invest (e.g., 50000)

- **Invest in a Tranche**
  - Call `invest` function on Pool contract:
    - `classId`: Choose 1, 2, or 3
    - `seriesId`: 1
    - `amount`: Investment amount (must be ≤ approved amount)
  - Verify transaction succeeds

- **Check Investment Holdings**
  - Call `investorHoldings` view function:
    - Parameters: `classId`, `seriesId`, `your_address`
  - Verify your holding amount matches investment

- **Check Tranche Token Balance**
  - Call `balanceOf` on TrancheToken contract:
    - Parameters: `your_address`, `classId`, `seriesId`
  - Verify you received the correct amount of tranche tokens

#### Phase 6: Payment Processing

- **Simulate Borrower Payment**
  - First approve Pool to spend your stablecoins for the payment
  - Call `depositPayment` function on Pool contract:
    - `classId`: Choose a tranche you invested in
    - `seriesId`: 1
    - `amount`: Payment amount (e.g., 10000)
  - Verify the payment was recorded

- **Check Payment Balance**
  - Call `payments` view function:
    - Parameters: `classId`, `seriesId`
  - Verify the payment amount is stored

- **Approve TrancheToken for Burning**
  - Call `setApprovalFor` on TrancheToken contract:
    - `operator`: Pool contract address
    - `approved`: true

- **Distribute Payments**
  - Call `distributePayments` function on Pool:
    - `classId`: Same as payment deposit
    - `seriesId`: 1
  - Verify transaction succeeds

- **Verify Payment Distribution**
  - Check your stablecoin balance increased
  - Verify your tranche token balance decreased (tokens burned)
  - Call `paidOut` to see cumulative payments received

#### Phase 7: Verification & Testing

- **Test View Functions**
  - `getInvestors(classId, seriesId)` - Returns array of investor addresses
  - `getLoanContracts(classId, seriesId)` - Returns loan contract addresses
  - `getLoanIds(classId, seriesId)` - Returns tokenIds in tranche
  - `getExpectedReturn(classId, seriesId, investor)` - Calculate expected returns


## 📁 Project Structure

```
SecuModel/
├── contracts/
│   ├── TokenTranche.sol          # Main smart contracts
│   └── erc3475/                  # ERC-3475 implementation
├── src/
│   ├── app.js                    # Express.js server
│   ├── script.js                 # Frontend JavaScript
│   ├── style.css                 # Styling
│   └── views/
│       └── index.ejs             # Main template
├── artifacts/                    # Compiled contracts
├── package.json                  # Dependencies
├── hardhat.config.js             # Hardhat configuration
└── README.md                     # This file
```

## 📝 Smart Contract Architecture

### Core Contracts

1. **MockERC20**: Simple stablecoin for payments and investments
2. **LoanNFT**: ERC-721 tokens representing individual loans with metadata
3. **TrancheToken**: ERC-3475 multi-class tokens for investment tranches
4. **Pool**: Main contract orchestrating the securitization process

### Contract Interactions

```
MockERC20 ←→ Pool ←→ TrancheToken
              ↓
           LoanNFT
```

## 🤝 Contributing

This project is part of an academic thesis. For questions or collaboration opportunities, please contact:

**Luca Brülhart**  
📧 luca.bruelhart@uzh.ch  
🎓 Student ID: 21-706-098  
🏫 University of Zurich

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **University of Zurich** - Academic supervision and support
- **OpenZeppelin** - Secure smart contract libraries
- **ERC-3475 Contributors** - Multi-class token standard
- **Hardhat Team** - Development tools and framework

---

**⚠️ Disclaimer**: This is a prototype for academic research purposes. Not intended for production use without proper security audits and legal compliance review. 