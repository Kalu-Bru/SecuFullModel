// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "erc3475/ERC3475.sol";
import "erc3475/IERC3475.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("MockUSD", "mUSD") {}
    function mint(address to, uint256 amt) external {
        _mint(to, amt); 
    }
}

/// @title LoanNFT: mint NFTs to represent individual loans with on-chain metadata
contract LoanNFT is ERC721 {
    uint256 private _nextTokenId;
    address public admin;

    /// @notice On-chain data for each loan NFT
    struct LoanData {
        uint256 principal;          // total loan value in smallest token units
        uint16  interestRateBps;    // interest rate in basis points (bps)
        uint64  maturityTimestamp;  // UNIX timestamp of loan maturity
        address borrower;           // borrower address for reference
    }

    // maps tokenId to its LoanData struct
    mapping(uint256 => LoanData) public loanData;

    event LoanMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 principal,
        uint16 interestRateBps,
        uint64 maturityTimestamp
    );

    constructor() ERC721("LoanNFT", "LNFT") {
        admin = msg.sender;
    }

    /// @notice Mint a new loan NFT with metadata
    /// @param to            Recipient of the loan NFT (borrower or pool)
    /// @param principal     Total loan value (in smallest unit, e.g. cents)
    /// @param interestRateBps Interest rate in basis points (e.g. 300 = 3%)
    /// @param maturityTimestamp UNIX timestamp when loan matures
    function mint(
        address to,
        uint256 principal,
        uint16 interestRateBps,
        uint64 maturityTimestamp
    ) external returns (uint256) {
        require(msg.sender == admin, "LoanNFT: only admin can mint");
        uint256 tokenId = ++_nextTokenId;
        _mint(to, tokenId);
        loanData[tokenId] = LoanData({
            principal: principal,
            interestRateBps: interestRateBps,
            maturityTimestamp: maturityTimestamp,
            borrower: to                              /// Borrower's address, here simplified with token target
        });
        emit LoanMinted(tokenId, to, principal, interestRateBps, maturityTimestamp);
        return tokenId;
    }

    /// @notice Retrieve metadata for a given loan NFT
    /// @param tokenId ID of the loan NFT
    /// @return LoanData struct with all on-chain metadata
    function getLoanData(uint256 tokenId) external view returns (LoanData memory) {
        require(ownerOf(tokenId) != address(0), "LoanNFT: query for nonexistent token");
        return loanData[tokenId];
    }
}

/// @title TrancheToken: ERC-3475 token to represent tranches of pooled loans
contract TrancheToken is ERC3475 {

    address public owner;

    constructor(address _owner) ERC3475() {
        owner = _owner;
    }
}

/// @title Pool: collects LoanNFTs, creates ERC-3475 tranches, handles investments & payouts
contract Pool {
    address public admin;
    LoanNFT public loanNFT;
    TrancheToken public trancheToken;
    IERC20 public stablecoin;

    struct TrancheInfo {
        address[] loanContracts;
        uint256[] loanIds;
        uint256 totalNotional;
        uint16  interestRateBps;
        address[] investors;
    }

    // maps classId and seriesId to certain tranche
    mapping(uint8 => mapping(uint256 => TrancheInfo)) public tranches;

    // payments available for redemption per class/series
    mapping(uint8 => mapping(uint256 => uint256)) public payments;

    // series counter per class
    mapping(uint8 => uint256) public nextSeries;

    // map investor holdings (tranche tokens)
    mapping(uint8 => mapping(uint256 => mapping(address => uint256))) public investorHoldings;

    // cumulative payouts made to investors
    mapping(uint8 => mapping(uint256 => mapping(address => uint256))) public paidOut;

    event PaymentDeposited(uint8 indexed classId, uint256 indexed seriesId, uint256 amount);
    event PaymentDistributed(uint8 indexed classId, uint256 indexed seriesId, address indexed investor, uint256 amount);
    event Invested(address indexed investor, uint8 indexed classId, uint256 indexed seriesId, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Pool: only admin");
        _;
    }

    constructor(address _loanNFT, address _stablecoin) {
        admin = msg.sender;
        loanNFT = LoanNFT(_loanNFT);
        stablecoin = IERC20(_stablecoin);
        trancheToken = new TrancheToken(address(this));
    }

    /// @notice Create a new tranche series backed by specific loan NFTs
    function createTranche(
        uint8 classId,
        uint256[] calldata loans,
        uint256 notional,
        uint16 rateBps
    ) external onlyAdmin returns (uint256) {
        uint256 seriesId = ++nextSeries[classId];
        address[] memory contracts = new address[](loans.length);
        for (uint i = 0; i < loans.length; i++) {
            contracts[i] = address(loanNFT);
        }
        // save tranche infos to struct
        tranches[classId][seriesId] = TrancheInfo({
            loanContracts: contracts,
            loanIds: loans,
            totalNotional: notional,
            interestRateBps: rateBps,
            investors: new address[](0)
        });

        // mint tranche tokens to pool for sale
        IERC3475.Transaction[] memory txs = new IERC3475.Transaction[](1);
        txs[0] = IERC3475.Transaction({
            classId: classId,
            nonceId: seriesId,
            amount: notional
        });
        trancheToken.issue(address(this), txs);
        return seriesId;
    }

    /// @notice Investor buys tranche tokens 1:1 for stablecoin
    function invest(
        uint8 classId,
        uint256 seriesId,
        uint256 amount
    ) external {
        require(
            stablecoin.transferFrom(msg.sender, address(this), amount),
            "Pool: payment failed"
        );

        // record first-time investor
        if (investorHoldings[classId][seriesId][msg.sender] == 0) {
            tranches[classId][seriesId].investors.push(msg.sender);
        }

        IERC3475.Transaction[] memory txs = new IERC3475.Transaction[](1);
        txs[0] = IERC3475.Transaction({
            classId: classId,
            nonceId: seriesId,
            amount: amount
        });
        trancheToken.transferFrom(address(this), msg.sender, txs);

        investorHoldings[classId][seriesId][msg.sender] += amount;
        emit Invested(msg.sender, classId, seriesId, amount);
    }

    /// @notice Admin deposits borrower payment into the pool for a tranche
    function depositPayment(
        uint8 classId,
        uint256 seriesId,
        uint256 amount
    ) external onlyAdmin {
        require(
            stablecoin.transferFrom(msg.sender, address(this), amount),
            "Pool: payment failed"
        );
        payments[classId][seriesId] += amount;
        emit PaymentDeposited(classId, seriesId, amount);
    }

    /// @notice Pro-rata distribution of all available payments, burns tokens, tracks payouts
    function distributePayments(
        uint8 classId,
        uint256 seriesId
    ) external onlyAdmin {
        uint256 totalPayment = payments[classId][seriesId];
        require(totalPayment > 0, "Pool: no funds to distribute");

        address[] storage investors = tranches[classId][seriesId].investors;
        uint256 totalInvested;
        uint256 totalExpectedPayout;
        
        // Calculate total invested amount and total expected payout (principal + interest)
        uint16 interestRate = tranches[classId][seriesId].interestRateBps;
        for (uint i = 0; i < investors.length; i++) {
            uint256 principalAmount = investorHoldings[classId][seriesId][investors[i]];
            totalInvested += principalAmount;
            // Calculate expected return: principal + (principal * interestRate / 10000)
            uint256 interestAmount = (principalAmount * interestRate) / 10000;
            totalExpectedPayout += principalAmount + interestAmount;
        }
        require(totalInvested > 0, "Pool: no investors");

        // Check if we have enough funds to pay full returns
        bool fullPayout = totalPayment >= totalExpectedPayout;
        
        for (uint i = 0; i < investors.length; i++) {
            address inv = investors[i];
            uint256 holding = investorHoldings[classId][seriesId][inv];
            
            if (holding > 0) {
                uint256 share;
                
                if (fullPayout) {
                    // Pay full principal + interest
                    uint256 interestAmount = (holding * interestRate) / 10000;
                    share = holding + interestAmount;
                } else {
                    // Pro-rata distribution of available funds based on expected returns
                    uint256 expectedReturn = holding + (holding * interestRate) / 10000;
                    share = (totalPayment * expectedReturn) / totalExpectedPayout;
                }
                
                if (share > 0) {
                    IERC3475.Transaction[] memory txs = new IERC3475.Transaction[](1);
                    txs[0] = IERC3475.Transaction({
                        classId: classId,
                        nonceId: seriesId,
                        amount: holding  // Burn the original token amount
                    });
                    trancheToken.burn(inv, txs);

                    require(
                        stablecoin.transfer(inv, share),
                        "Pool: transfer failed"
                    );

                    investorHoldings[classId][seriesId][inv] = 0;  // Reset to 0 after full payout
                    paidOut[classId][seriesId][inv] += share;
                    payments[classId][seriesId] -= share;

                    emit PaymentDistributed(classId, seriesId, inv, share);
                }
            }
        }
    }

    /// @notice Calculate expected return for an investor (principal + interest)
    function getExpectedReturn(
        uint8 classId,
        uint256 seriesId,
        address investor
    ) external view returns (uint256) {
        uint256 principal = investorHoldings[classId][seriesId][investor];
        uint16 interestRate = tranches[classId][seriesId].interestRateBps;
        uint256 interest = (principal * interestRate) / 10000;
        return principal + interest;
    }

    /// @notice Calculate total expected payout for a tranche
    function getTotalExpectedPayout(
        uint8 classId,
        uint256 seriesId
    ) external view returns (uint256) {
        address[] storage investors = tranches[classId][seriesId].investors;
        uint256 totalExpected;
        uint16 interestRate = tranches[classId][seriesId].interestRateBps;
        
        for (uint i = 0; i < investors.length; i++) {
            uint256 principal = investorHoldings[classId][seriesId][investors[i]];
            uint256 interest = (principal * interestRate) / 10000;
            totalExpected += principal + interest;
        }
        return totalExpected;
    }

    function getInvestors(uint8 classId, uint256 seriesId) external view returns (address[] memory) {
        return tranches[classId][seriesId].investors;
    }

    function getLoanContracts(uint8 classId, uint256 seriesId)
        external
        view
        returns (address[] memory)
    {
        return tranches[classId][seriesId].loanContracts;
    }

    function getLoanIds(uint8 classId, uint256 seriesId)
        external
        view
        returns (uint256[] memory)
    {
        return tranches[classId][seriesId].loanIds;
    }
}

