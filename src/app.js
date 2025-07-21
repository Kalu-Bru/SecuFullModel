const express = require("express");
const app = express();
const path = require("path");
const { ethers } = require("ethers");
const dfd = require("danfojs-node");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.listen(3000, () => {
    console.log("Server running on PORT 3000...");
})

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname)));
app.use("/images", express.static(path.join(__dirname, "src/images")));

let mockERC20Address = "";
let loanNFTAddress = "";
let poolAddress = "";
let currentStep = 1;
let rows = "";
let tokenIds = [];
let seniorNotional = 0;
let mezzanineNotional = 0;
let juniorNotional = 0;
let selectedTrancheId = null;

const mockERC20Artifact = require("../artifacts/contracts/TokenTranche.sol/MockERC20.json");
const loanNFTArtifact = require("../artifacts/contracts/TokenTranche.sol/LoanNFT.json");
const poolArtifact = require("../artifacts/contracts/TokenTranche.sol/Pool.json");
const trancheArtifact = require("../artifacts/contracts/TokenTranche.sol/TrancheToken.json");
const erc3475Artifact = require("../artifacts/erc3475/ERC3475.sol/ERC3475.json")

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
let signer = new ethers.Wallet("0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e", provider);
let investor = new ethers.Wallet("0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0", provider);

function render(res, vars = {}) {
    res.render("index", {
        userAddress: signer.address,
        alert: vars.alert ?? null,
        mockERC20: mockERC20Address,
        loanNFT: loanNFTAddress,
        tokenIds: tokenIds,
        trancheInfo: vars.trancheInfo ?? null,
        loans: vars.loans ?? null,
        step1: vars.step1 ?? false,
        step2: vars.step2 ?? false,
        step3: vars.step3 ?? false,
        step4: vars.step4 ?? false,
        step5: vars.step5 ?? false,
        step6: vars.step6 ?? null,
        step7: vars.step7 ?? false,
        step8: vars.step8 ?? false,
        step9: vars.step9 ?? null,
        step10: vars.step10 ?? null,
        step11: vars.step11 ?? null,
        step12: vars.step12 ?? false,
        alert: vars.alert ?? null,
        currentStep
    });
}

function generateRandomLoans(n = 20) {
    const principals = [];
    const interestRates = [];
    const maturities = [];
  
    const now = new Date();
    const minDate = new Date(now);
    minDate.setFullYear(minDate.getFullYear() + 1);
    const maxDate = new Date(now);
    maxDate.setFullYear(maxDate.getFullYear() + 5);
  
    for (let i = 0; i < n; i++) {
        const principal = Math.floor(Math.random() * (1_000_000 - 100_000 + 1) + 100_000);

        const interestRate = Math.floor(Math.random() * (1_000 - 100 + 1) + 100);

        const maturityTimestamp = Math.floor(
            minDate.getTime() +
            Math.random() * (maxDate.getTime() - minDate.getTime())
        );

        principals.push(principal);
        interestRates.push(interestRate);
        maturities.push(maturityTimestamp);
    }

    return new dfd.DataFrame({
        "principal": principals,
        "interest rate bps": interestRates,
        "maturity timestamp": maturities
    });
}

app.get('/', (req, res) => {
    currentStep = 1;
    render(res);
});

app.post('/deploy-mock', async (req, res) => {
    const MockERC20Factory = new ethers.ContractFactory(
        mockERC20Artifact.abi,
        mockERC20Artifact.bytecode,
        signer
    );

    const mock = await MockERC20Factory.deploy();
    await mock.waitForDeployment();
    mockERC20Address = mock.target;
    console.log("Mock ERC20 Contract deployed at:", mock.target);

    currentStep = 2;
    render(res, {
        step1: true,
        userAddress: signer.address
    })
});

app.post('/get-stable', async (req, res) => {
    const to = req.body.userAddress;
    const amt = req.body.mockAmount;
    const mock = new ethers.Contract(mockERC20Address, mockERC20Artifact.abi, signer);
    await mock.mint(to, ethers.parseEther(amt.toString()));

    currentStep = 3;
    render(res, {
        step2: true
    })
});

app.post('/deploy-loan', async (req, res) => {
    const LoanNFTFactory = new ethers.ContractFactory(
        loanNFTArtifact.abi,
        loanNFTArtifact.bytecode,
        signer
    );

    const loan = await LoanNFTFactory.deploy();
    await loan.waitForDeployment();
    loanNFTAddress = loan.target;
    console.log("Loan NFT Contract deployed at:", loan.target);

    currentStep = 4
    render(res, {
        step3: true
    })
});

app.post('/deploy-pool', async (req, res) => {
    const mockerc20 = req.body.mockerc20Address;
    const loannft = req.body.loannftAddress;

    const PoolFactory = new ethers.ContractFactory(
        poolArtifact.abi,
        poolArtifact.bytecode,
        signer
    );

    const pool = await PoolFactory.deploy(loannft, mockerc20);
    await pool.waitForDeployment();
    poolAddress = pool.target;
    console.log("Pool Contract deployed at:", pool.target);

    const df = generateRandomLoans(20);
    rows = df.toJSON();

    const loans = rows.map(r => ({
        principal:         r.principal,
        interestRateBps:   r['interest rate bps'],
        maturityTimestamp: Number(r['maturity timestamp'])
    }));

    currentStep = 5;
    render(res, {
        step4: true,
        loans: loans
    })
});

app.post('/tokenise-loans', async (req, res) => {
    const to = poolAddress;
    const loan = new ethers.Contract(loanNFTAddress, loanNFTArtifact.abi, signer);

    let nonce = await provider.getTransactionCount(signer.address, "latest");
    for (const row of rows) {
        const tx = await loan.mint(
            to,
            row.principal,
            row["interest rate bps"],
            row["maturity timestamp"],
            { nonce }
        );
        const receipt = await tx.wait();
        let tokenId;
        for (const log of receipt.logs) {
            let parsed;
            try {
                parsed = loan.interface.parseLog(log);
            } catch (e) {
                continue;
            }
            if (parsed.name === 'LoanMinted') {
                tokenId = parsed.args.tokenId;
                break;
            }
        }

        if (!tokenId) {
            throw new Error("LoanMinted event not found in tx receipt");
        }

        const tokenIdStr = tokenId.toString();
        tokenIds.push(tokenIdStr);
        nonce++;
    }

    currentStep = 6;
    render(res, {
        step5: true
    })
});

app.post('/loan-data', async (req, res) => {
    const index = req.body.index;

    if (index > 19) {
        currentStep = 6;
        render(res, {
            alert: "Please follow the instructions to fill out the fields!"
        })
    }
    const loan = new ethers.Contract(loanNFTAddress, loanNFTArtifact.abi, signer);
    const loanData = await loan.getLoanData(index);

    const cleanData = {
        principal: Number(loanData.principal),
        interestRate: Number(loanData.interestRateBps)/100,
        maturityTimestamp: (new Date(Number(loanData.maturityTimestamp))).toLocaleString()
    }

    currentStep = 7;
    render(res, {
        step6: cleanData
    })
});

app.post('/create-tranches', async (req, res) => {
    const { seniorBps, mezzanineBps, juniorBps } = req.body;
    const seniorTokens = [1, 2, 3, 4, 5, 6];
    const mezzanineTokens = [7, 8, 9, 10, 11, 12];
    const juniorTokens = [13, 14, 15, 16, 17, 18, 19];

    const loan = new ethers.Contract(loanNFTAddress, loanNFTArtifact.abi, signer);

    for (const id of seniorTokens) {
        const [notional] = await loan.loanData(id);
        seniorNotional += Number(notional);
    }

    for (const id of mezzanineTokens) {
        const [notional] = await loan.loanData(id);
        mezzanineNotional += Number(notional);
    }

    for (const id of juniorTokens) {
        const [notional] = await loan.loanData(id);
        juniorNotional += Number(notional);
    }

    const pool = new ethers.Contract(poolAddress, poolArtifact.abi, signer);
    const provider = signer.provider;

    const myAddress = await signer.getAddress();
    let nonce = await provider.getTransactionCount(myAddress, 'pending');

    async function sendTranche(trancheId, tokens, notional, bps) {
        const tx = await pool.createTranche(
            trancheId,
            tokens,
            notional,
            Number(bps),
            { nonce: nonce++ }
        );
        return tx.wait();
    }

    await sendTranche(1, seniorTokens, seniorNotional, seniorBps);
    await sendTranche(2, mezzanineTokens, mezzanineNotional, mezzanineBps);
    await sendTranche(3, juniorTokens, juniorNotional, juniorBps);

    async function fetchTrancheInfo(classId, seriesId = 1) {
        const [ totalNotional, interestRateBps ] = await pool.tranches(classId, seriesId);
        const loanContracts = await pool.getLoanContracts(classId, seriesId);
        const rawLoanIds = await pool.getLoanIds(classId, seriesId);
        const loanIds = rawLoanIds.map(id => Number(id));
        return {
            loanContracts: loanContracts[1],
            loanIds,
            totalNotional: Number(totalNotional),
            interestRateBps
        };
    }
    
    const [ senior, mezzanine, junior ] = await Promise.all([
        fetchTrancheInfo(1, 1),
        fetchTrancheInfo(2, 1),
        fetchTrancheInfo(3, 1),
    ]);

    currentStep = 8;
    render(res, {
        step7: true,
        trancheInfo: {
            senior,
            mezzanine,
            junior
        }
    });
});

app.post('/buy-tranche', async (req, res) => {
    const { trancheId, amount } = req.body;

    if (amount < 10000 || amount > 500000) {
        currentStep = 8;
        render(res, {
            alert: "Please follow the instructions to fill out the fields!"
        })
    }
    const amountRequested = amount.toString();
  
    const trancheIndex =
        trancheId === "Senior"    ? 1 :
        trancheId === "Mezzanine" ? 2 : 3;
  
    selectedTrancheId = trancheIndex;
  
    const pool = new ethers.Contract(poolAddress, poolArtifact.abi, investor);
  
    let availableNotional = trancheIndex === 1
        ? seniorNotional
        : trancheIndex === 2
            ? mezzanineNotional
            : juniorNotional;
  
    const investAmount = amountRequested > availableNotional
        ? availableNotional
        : amountRequested;
  
    const provider = signer.provider;
    const adminAddress = await signer.getAddress();
    let adminNonce = await provider.getTransactionCount(adminAddress, 'pending');
  
    const investorAddress = await investor.getAddress();
    let userNonce = await provider.getTransactionCount(investorAddress, 'pending');

    const mockAdmin = new ethers.Contract(mockERC20Address, mockERC20Artifact.abi, signer);
    const txMint = await mockAdmin.mint(investorAddress, ethers.parseEther(investAmount.toString()), {
        nonce: adminNonce++
    });
    await txMint.wait();
  
    const mockUser = new ethers.Contract(mockERC20Address, mockERC20Artifact.abi, investor);
    const txApprove = await mockUser.approve(poolAddress, ethers.parseEther(investAmount.toString()), {
        nonce: userNonce++
    });
    await txApprove.wait();
  
    const txInvest = await pool.invest(trancheIndex, 1, investAmount, {
        nonce: userNonce++
    });
    await txInvest.wait();
  
    currentStep = 9;
    render(res, {
        step8: true
    });
});

app.post('/check-holdings', async (req, res) => {
    const pool = new ethers.Contract(poolAddress, poolArtifact.abi, investor);
    const investorHoldingsSenior = await pool.investorHoldings(1, 1, investor.address);
    const investorHoldingsMezzanine = await pool.investorHoldings(2, 1, investor.address);
    const investorHoldingsJunior = await pool.investorHoldings(3, 1, investor.address);

    currentStep = 10;
    render(res, {
        step9: {
            senior: investorHoldingsSenior.toString(),
            mezzanine: investorHoldingsMezzanine.toString(),
            junior: investorHoldingsJunior.toString()
        }
    });
});

app.post('/check-balance', async (req, res) => {
    const pool = new ethers.Contract(poolAddress, poolArtifact.abi, investor);
    const trancheAddr = await pool.trancheToken();

    const tranche = new ethers.Contract(
        trancheAddr,
        erc3475Artifact.abi,
        investor
    );

    const rawBalance = await tranche.balanceOf(
        investor.address,
        selectedTrancheId,
        1
    );

    const investorBalance = rawBalance.toString();

    const expectedReturn = await pool.getExpectedReturn(
        selectedTrancheId,
        1,
        investor.address
    );

    const [, interestRateBps] = await pool.tranches(selectedTrancheId, 1);
    const interestRatePercent = Number(interestRateBps) / 100;

    currentStep = 11;
    render(res, {
        step10: {
            balance: investorBalance,
            expectedReturn: expectedReturn.toString(),
            interestRate: interestRatePercent,
            principal: investorBalance,
            interest: (Number(expectedReturn) - Number(investorBalance)).toString()
        }
    });
});

app.post('/deposit-payment', async (req, res) => {
    try {
        const amount = req.body.amount.toString();
        const paymentAmount = parseInt(amount);
        const totalAmount = paymentAmount * 3;

        const provider = signer.provider;
        const adminAddress = await signer.getAddress();
        let nonce = await provider.getTransactionCount(adminAddress, 'pending');

        const pool = new ethers.Contract(poolAddress, poolArtifact.abi, signer);
        const stablecoinAddress = await pool.stablecoin();
        const token = new ethers.Contract(
            stablecoinAddress,
            mockERC20Artifact.abi,
            signer
        );

        await (await token.mint(adminAddress, totalAmount, { nonce })).wait();
        nonce++;
        await (await token.approve(poolAddress, totalAmount, { nonce })).wait();
        nonce++;

        const payments = [];
        const paymentInfo = [];
        
        for (let classId = 1; classId <= 3; classId++) {
            const tx = await pool.depositPayment(classId, 1, paymentAmount, { nonce });
            const receipt = await tx.wait();
            nonce++;

            const totalExpected = await pool.getTotalExpectedPayout(classId, 1);
            const totalDeposited = await pool.payments(classId, 1);

            receipt.logs.forEach(log => {
                if (
                    log.address.toLowerCase() === poolAddress.toLowerCase() &&
                    log.fragment?.name === 'PaymentDeposited'
                ) {
                    const [cId, sId, amt] = log.args;
                    payments.push({
                        classId: Number(cId),
                        seriesId: Number(sId),
                        amount: amt.toString()
                    });
                }
            });

            paymentInfo.push({
                classId,
                deposited: totalDeposited.toString(),
                expectedPayout: totalExpected.toString(),
                fullyFunded: Number(totalDeposited) >= Number(totalExpected)
            });
        }

        currentStep = 12;
        render(res, {
            step11: {
                payments,
                paymentInfo
            }
        });

    } catch (error) {
        console.error('deposit-payment error:', error);
        res.status(500).send({ error: error.message });
    }
});

app.post('/distribute-payments', async (req, res) => {
    try {
        const provider = signer.provider;
        const adminAddress = await signer.getAddress();
        const investorAddress = await investor.getAddress();

        const pool = new ethers.Contract(poolAddress, poolArtifact.abi, signer);
        const tokenAddress = await pool.trancheToken(); 

        const distributionInfo = [];
        let totalExpectedPayout, availablePayments, interestRatePercent;

        try {
            const payments = await pool.payments(selectedTrancheId, 1);
            if (payments == 0) {
                console.log('No payments to distribute');
                render(res, { step12: true });
                return;
            }
            
            totalExpectedPayout = await pool.getTotalExpectedPayout(selectedTrancheId, 1);
            availablePayments = await pool.payments(selectedTrancheId, 1);
            const [, interestRateBps] = await pool.tranches(selectedTrancheId, 1);
            interestRatePercent = Number(interestRateBps) / 100;
            
            const investors = await pool.getInvestors(selectedTrancheId, 1);
            if (investors.length === 0) {
                console.log('No investors found');
                render(res, { step12: true });
                return;
            }

            for (const investorAddr of investors) {
                const poolHoldings = await pool.investorHoldings(selectedTrancheId, 1, investorAddr);
                if (Number(poolHoldings) > 0) {
                    const expectedReturn = await pool.getExpectedReturn(selectedTrancheId, 1, investorAddr);
                    const interest = Number(expectedReturn) - Number(poolHoldings);
                    
                    distributionInfo.push({
                        investor: investorAddr,
                        principal: poolHoldings.toString(),
                        expectedInterest: interest.toString(),
                        expectedTotal: expectedReturn.toString()
                    });
                }
            }
            
            for (const investorAddr of investors) {
                const poolHoldings = await pool.investorHoldings(selectedTrancheId, 1, investorAddr);
                if (Number(poolHoldings) === 0) continue;
                
                let investorWallet;
                if (investorAddr.toLowerCase() === investorAddress.toLowerCase()) {
                    investorWallet = investor;
                } else {
                    continue;
                }
                
                const trancheTokenAsThisInvestor = new ethers.Contract(
                    tokenAddress,
                    erc3475Artifact.abi,
                    investorWallet
                );
                
                const hasApproval = await trancheTokenAsThisInvestor.isApprovedFor(investorAddr, poolAddress);
                
                if (!hasApproval) {
                    const approvalTx = await trancheTokenAsThisInvestor.setApprovalFor(poolAddress, true);
                    await approvalTx.wait();
                }
            }
            
            const tx = await pool.distributePayments(selectedTrancheId, 1);
            await tx.wait();
            
        } catch (error) {
            console.error(`Error distributing payments:`, error.message);
        }

        currentStep = 13;
        render(res, {
            step12: {
                distributionComplete: true,
                interestRate: interestRatePercent,
                totalExpected: totalExpectedPayout.toString(),
                totalAvailable: availablePayments.toString(),
                fullyFunded: Number(availablePayments) >= Number(totalExpectedPayout),
                investorDetails: distributionInfo
            }
        });

    } catch (error) {
        console.error('distribute-payments error:', error);
        res.status(500).send({ error: error.message });
    }
});





  
  
  
  
  
  
  