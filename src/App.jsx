import { useState, useEffect, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { ethers } from "ethers";
import "./App.css";
import {
  BASE_CHAIN_ID,
  USDC_ADDRESS,
  LOTTERY_CONTRACT_ADDRESS,
  USDC_ABI,
  LOTTERY_ABI,
  TICKET_PRICE_WEI,
  isContractDeployed,
} from "./contracts/config";

function App() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [lotteryContract, setLotteryContract] = useState(null);
  const [usdcContract, setUsdcContract] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState("0");

  const [tickets, setTickets] = useState([]);
  const [roundEndTime, setRoundEndTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [totalTicketsSold, setTotalTicketsSold] = useState(0);
  const [prizePool, setPrizePool] = useState(0);
  const [currentRoundId, setCurrentRoundId] = useState(0);
  const [winningNumbers, setWinningNumbers] = useState(null);
  const [lastWinner, setLastWinner] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [userStats, setUserStats] = useState({
    totalSpent: 0,
    totalWon: 0,
    pnl: 0,
  });
  const [userHistory, setUserHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("play"); // play, history, stats

  // Initialize Farcaster SDK
  useEffect(() => {
    const initSDK = async () => {
      try {
        await sdk.actions.ready();
        setIsSDKLoaded(true);
        console.log("Farcaster SDK loaded successfully");
      } catch (error) {
        console.error("Failed to initialize SDK:", error);
        setIsSDKLoaded(true); // Set true anyway for desktop fallback
      }
    };
    initSDK();
  }, []);

  // Switch to Base network
  const switchToBase = async (ethProvider) => {
    try {
      await ethProvider.send("wallet_switchEthereumChain", [
        { chainId: `0x${BASE_CHAIN_ID.toString(16)}` },
      ]);
    } catch (error) {
      if (error.code === 4902) {
        await ethProvider.send("wallet_addEthereumChain", [
          {
            chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
            chainName: "Base",
            nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ]);
      } else {
        throw error;
      }
    }
  };

  // Connect wallet and initialize contracts
  const connectWallet = async () => {
    try {
      // Try to get Farcaster/Base embedded wallet first
      let ethProvider;
      
      if (isSDKLoaded && sdk?.wallet) {
        // Use Farcaster SDK embedded wallet
        console.log("Using Farcaster SDK wallet");
        ethProvider = await sdk.wallet.getEthereumProvider();
      } else if (window.ethereum) {
        // Fallback to browser extension wallet (for desktop)
        console.log("Using browser extension wallet");
        ethProvider = window.ethereum;
      } else {
        alert("No wallet found. Please open in Farcaster or Base app.");
        return;
      }

      const web3Provider = new ethers.BrowserProvider(ethProvider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);

      await switchToBase(ethProvider);

      const web3Signer = await web3Provider.getSigner();
      const address = accounts[0];

      setProvider(web3Provider);
      setSigner(web3Signer);
      setWalletAddress(address);

      // Initialize contracts
      const lottery = new ethers.Contract(
        LOTTERY_CONTRACT_ADDRESS,
        LOTTERY_ABI,
        web3Signer
      );
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, web3Signer);

      setLotteryContract(lottery);
      setUsdcContract(usdc);

      // Load USDC balance
      const balance = await usdc.balanceOf(address);
      setUsdcBalance(ethers.formatUnits(balance, 6));

      // Load round data
      await loadRoundData(lottery, address);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      alert("Failed to connect wallet: " + error.message);
    }
  };

  // Load current round data from contract
  const loadRoundData = useCallback(async (lottery, userAddress) => {
    try {
      console.log("Loading round data...");
      const roundData = await lottery.getCurrentRound();
      const [roundId, startTime, endTime, totalTickets, pool, ended] =
        roundData;

      console.log("Round data loaded:", {
        roundId: Number(roundId),
        ended,
        totalTickets: Number(totalTickets),
        pool: parseFloat(ethers.formatUnits(pool, 6)),
      });

      setCurrentRoundId(Number(roundId));
      setRoundEndTime(new Date(Number(endTime) * 1000));
      setTotalTicketsSold(Number(totalTickets));
      setPrizePool(parseFloat(ethers.formatUnits(pool, 6)));

      // Load user tickets
      if (userAddress) {
        const userTickets = await lottery.getUserTicketsForCurrentRound(
          userAddress
        );
        const formattedTickets = userTickets.map((ticket, index) => ({
          id: `${roundId}-${index}`,
          numbers: [Number(ticket.number1), Number(ticket.number2)],
          owner: ticket.owner,
        }));
        setTickets(formattedTickets);

        // Load user stats
        const stats = await lottery.getUserStats(userAddress);
        setUserStats({
          totalSpent: parseFloat(ethers.formatUnits(stats.totalSpent, 6)),
          totalWon: parseFloat(ethers.formatUnits(stats.totalWon, 6)),
          pnl: parseFloat(ethers.formatUnits(stats.pnl, 6)),
        });

        // Load user history
        const historyRounds = await lottery.getUserRoundHistory(userAddress);
        const historyDetails = await Promise.all(
          historyRounds.map(async (rId) => {
            const details = await lottery.getRoundDetails(rId);
            return {
              roundId: Number(rId),
              ended: details.ended,
              winningNumber1: Number(details.winningNumber1),
              winningNumber2: Number(details.winningNumber2),
              winner: details.winner,
              winnerPrize: parseFloat(
                ethers.formatUnits(details.winnerPrize, 6)
              ),
              prizeClaimed: details.prizeClaimed,
              isWinner:
                details.winner.toLowerCase() === userAddress.toLowerCase(),
            };
          })
        );
        setUserHistory(historyDetails.reverse()); // Most recent first
      }

      // Check if round ended
      if (ended) {
        console.log("Round is ended, loading winner info");
        const roundInfo = await lottery.rounds(roundId);
        const winNum1 = Number(roundInfo.winningNumber1);
        const winNum2 = Number(roundInfo.winningNumber2);

        // Only set winning numbers if they are valid (not 0)
        if (winNum1 > 0 && winNum2 > 0) {
          setWinningNumbers([winNum1, winNum2]);
          if (roundInfo.winner !== ethers.ZeroAddress) {
            setLastWinner({
              address: roundInfo.winner,
              amount: parseFloat(ethers.formatUnits(roundInfo.winnerPrize, 6)),
              numbers: [winNum1, winNum2],
            });
          }
        } else {
          // Round ended but no valid winners (no tickets sold)
          setWinningNumbers(null);
          setLastWinner(null);
        }
      } else {
        // Clear any previous results if this is a new active round
        console.log("Clearing previous round results - new active round");
        setWinningNumbers(null);
        setLastWinner(null);
      }

      console.log("Finished loading round data");
    } catch (error) {
      console.error("Failed to load round data:", error);
    }
  }, []);

  // Timer countdown
  useEffect(() => {
    console.log("Timer useEffect running with:", {
      roundEndTime: roundEndTime?.toString(),
      lotteryContract: !!lotteryContract,
      walletAddress,
      totalTicketsSold,
    });

    if (!roundEndTime || !lotteryContract) {
      console.log("Timer useEffect early return - missing dependencies");
      return;
    }

    // Validate that roundEndTime is a proper Date object
    if (!(roundEndTime instanceof Date) || isNaN(roundEndTime.getTime())) {
      console.log("Timer useEffect early return - invalid roundEndTime");
      return;
    }

    const interval = setInterval(async () => {
      const now = new Date();
      const diff = roundEndTime - now;
      console.log("Timer check - diff:", diff);

      if (diff <= 0) {
        console.log("Round time expired");
        setTimeRemaining("Round Ended");
        clearInterval(interval);

        // Backend will automatically end the round - just wait and refresh
        setTimeout(async () => {
          if (!lotteryContract || !walletAddress) return;

          // Just refresh to check if backend ended the round
          await loadRoundData(lotteryContract, walletAddress);
        }, 5000); // Wait 5 seconds for backend to process
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, "0")}`);
      }
    }, 1000);

    return () => {
      console.log("Cleaning up timer interval");
      clearInterval(interval);
    };
  }, [
    roundEndTime,
    lotteryContract,
    walletAddress,
    loadRoundData,
    totalTicketsSold,
  ]);

  // Refresh data periodically
  useEffect(() => {
    if (!lotteryContract || !walletAddress) return;

    const interval = setInterval(() => {
      loadRoundData(lotteryContract, walletAddress);
      if (usdcContract) {
        usdcContract.balanceOf(walletAddress).then((balance) => {
          setUsdcBalance(ethers.formatUnits(balance, 6));
        });
      }
    }, 15000); // Refresh every 15 seconds (increased from 10)

    return () => clearInterval(interval);
  }, [lotteryContract, walletAddress, usdcContract, loadRoundData]);

  const generateRandomNumbers = () => {
    const num1 = Math.floor(Math.random() * 50) + 1;
    let num2 = Math.floor(Math.random() * 50) + 1;
    while (num2 === num1) {
      num2 = Math.floor(Math.random() * 50) + 1;
    }
    return [num1, num2].sort((a, b) => a - b);
  };

  const maskAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}${"*".repeat(28)}${address.slice(-4)}`;
  };

  const claimWinnings = async (roundId) => {
    if (!lotteryContract) return;

    setIsProcessing(true);
    setTxStatus(`Claiming winnings from Round #${roundId}...`);

    try {
      const tx = await lotteryContract.claimWinnings(roundId);
      await tx.wait();

      alert(`✅ Successfully claimed winnings from Round #${roundId}!`);

      // Refresh data
      await loadRoundData(lotteryContract, walletAddress);

      // Refresh USDC balance
      if (usdcContract && walletAddress) {
        const balance = await usdcContract.balanceOf(walletAddress);
        setUsdcBalance(ethers.formatUnits(balance, 6));
      }
    } catch (error) {
      console.error("Claim failed:", error);
      alert("Failed to claim winnings: " + error.message);
    } finally {
      setIsProcessing(false);
      setTxStatus("");
    }
  };

  const buyTicket = async (count = 1) => {
    if (!walletAddress || !lotteryContract || !usdcContract) {
      alert("Please connect your wallet first");
      return;
    }

    if (!isContractDeployed()) {
      alert(
        "⚠️ Smart Contract Not Deployed!\n\n" +
          "Please deploy the contract first.\n" +
          "See QUICKSTART.txt for instructions."
      );
      return;
    }

    setIsProcessing(true);
    setTxStatus("Preparing...");

    try {
      const totalCost = BigInt(TICKET_PRICE_WEI) * BigInt(count);

      // Check USDC balance
      const balance = await usdcContract.balanceOf(walletAddress);
      if (balance < totalCost) {
        setIsProcessing(false);
        setTxStatus("");
        alert(
          `Not enough USDC! You need $${ethers.formatUnits(totalCost, 6)} USDC`
        );
        return;
      }

      // Check allowance and approve if needed
      setTxStatus("Checking approval...");
      const allowance = await usdcContract.allowance(
        walletAddress,
        LOTTERY_CONTRACT_ADDRESS
      );

      // Always approve enough for current + future purchases to avoid repeated approvals
      const approvalAmount = BigInt(TICKET_PRICE_WEI) * BigInt(100); // Approve for 100 tickets worth

      if (allowance < totalCost) {
        setTxStatus("Approving USDC (one-time)...");
        try {
          const approveTx = await usdcContract.approve(
            LOTTERY_CONTRACT_ADDRESS,
            approvalAmount
          );
          await approveTx.wait();
          setTxStatus("Approved! Now buying tickets...");
        } catch (approveError) {
          setIsProcessing(false);
          setTxStatus("");
          alert("Approval cancelled or failed. Please try again.");
          return;
        }
      }

      // Generate all ticket numbers
      const numbers1 = [];
      const numbers2 = [];
      for (let i = 0; i < count; i++) {
        const [num1, num2] = generateRandomNumbers();
        numbers1.push(num1);
        numbers2.push(num2);
      }

      // Buy all tickets in ONE transaction
      setTxStatus(`Buying ${count} ticket${count > 1 ? "s" : ""}...`);
      const tx = await lotteryContract.buyTickets(numbers1, numbers2);
      await tx.wait();

      setTxStatus("Success! Updating...");

      // Refresh everything
      await loadRoundData(lotteryContract, walletAddress);
      const newBalance = await usdcContract.balanceOf(walletAddress);
      setUsdcBalance(ethers.formatUnits(newBalance, 6));

      setTxStatus("");

      // Show success message
      alert(
        `✅ Success! Purchased ${count} ticket${
          count > 1 ? "s" : ""
        }!\nYour tickets are shown below.`
      );
    } catch (error) {
      console.error("Failed to purchase ticket:", error);
      setTxStatus("");

      // Friendly error messages
      let errorMsg = "Transaction failed. ";
      if (error.message?.includes("user rejected")) {
        errorMsg = "Transaction was cancelled.";
      } else if (error.message?.includes("insufficient funds")) {
        errorMsg = "Not enough ETH for gas fees.";
      } else {
        errorMsg += "Please try again.";
      }
      alert(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const endRoundManual = async () => {
    if (!lotteryContract) {
      alert("Contract not initialized");
      return;
    }

    setIsProcessing(true);
    setTxStatus("Ending round...");

    try {
      const tx = await lotteryContract.endRound();
      setTxStatus("Waiting for confirmation...");
      await tx.wait();

      setTxStatus("Round ended! Loading results...");
      // Wait a moment for blockchain to update then refresh
      setTimeout(async () => {
        await loadRoundData(lotteryContract, walletAddress);
        setTxStatus("");
        alert("Round ended successfully! Check the History tab for results.");
      }, 2000);
    } catch (error) {
      console.error("Failed to end round:", error);
      alert("Failed to end round: " + (error.reason || error.message));
      setTxStatus("");
    } finally {
      setIsProcessing(false);
    }
  };

  const myTickets = tickets.filter((t) => t.owner === walletAddress);

  return (
    <div className="app-container">
      <div className="lottery-app">
        <header className="header">
          <h1>🎰 Lottery Mini App</h1>
          <p className="subtitle">2-minute rounds • $0.1 USDC per ticket</p>
        </header>

        {!walletAddress ? (
          <div className="connect-section">
            <div className="connect-card">
              <h2>Welcome!</h2>
              <p>Connect your wallet to start playing</p>
              <p className="network-info">Base Network • USDC</p>
              <button onClick={connectWallet} className="btn btn-primary">
                Connect Wallet
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="wallet-info">
              <div>
                <span className="label">Connected:</span>
                <span className="address">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
              <div className="balance-info">
                <span className="label">USDC:</span>
                <span className="balance">
                  ${parseFloat(usdcBalance).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="tabs">
              <button
                className={`tab ${activeTab === "play" ? "active" : ""}`}
                onClick={() => setActiveTab("play")}
              >
                Play
              </button>
              <button
                className={`tab ${activeTab === "history" ? "active" : ""}`}
                onClick={() => setActiveTab("history")}
              >
                History
              </button>
              <button
                className={`tab ${activeTab === "stats" ? "active" : ""}`}
                onClick={() => setActiveTab("stats")}
              >
                My Stats
              </button>
            </div>

            {txStatus && (
              <div className="tx-status">
                <div className="loading-spinner"></div>
                <span>{txStatus}</span>
              </div>
            )}

            {activeTab === "play" && (
              <>
                {winningNumbers &&
                winningNumbers[0] > 0 &&
                winningNumbers[1] > 0 ? (
                  <div className="results-section">
                    <h2>🎉 Round Results!</h2>
                    <div className="winning-numbers">
                      <div className="number-ball">{winningNumbers[0]}</div>
                      <div className="number-ball">{winningNumbers[1]}</div>
                    </div>
                    {lastWinner && (
                      <div className="winner-announcement">
                        <p className="winner-title">Winner!</p>
                        <p className="winner-address">
                          {lastWinner.address.slice(0, 6)}...
                          {lastWinner.address.slice(-4)}
                        </p>
                        <p className="winner-amount">
                          Won ${lastWinner.amount.toFixed(2)} USDC
                        </p>
                      </div>
                    )}
                  </div>
                ) : timeRemaining === "Round Ended" ? (
                  <>
                    <div className="round-ended-info">
                      <h2>⏰ Round #{currentRoundId} Ended</h2>

                      {totalTicketsSold > 0 ? (
                        <div
                          className="info-box"
                          style={{
                            marginTop: "20px",
                            marginBottom: "20px",
                            background:
                              "linear-gradient(135deg, rgba(40, 167, 69, 0.15) 0%, rgba(40, 167, 69, 0.05) 100%)",
                            borderColor: "rgba(40, 167, 69, 0.4)",
                          }}
                        >
                          <p
                            style={{
                              fontSize: "18px",
                              fontWeight: "600",
                              marginBottom: "10px",
                            }}
                          >
                            ✅ Round Ending...
                          </p>
                          <p style={{ fontSize: "15px", marginBottom: "8px" }}>
                            Picking winner automatically
                          </p>
                          <p style={{ fontSize: "14px", opacity: 0.9 }}>
                            💰 Winner will be notified - No action needed!
                          </p>
                        </div>
                      ) : (
                        <div
                          className="info-box"
                          style={{ marginTop: "20px", marginBottom: "20px" }}
                        >
                          <p
                            style={{
                              fontSize: "18px",
                              fontWeight: "600",
                              marginBottom: "10px",
                            }}
                          >
                            🎯 Start New Round
                          </p>
                          <p style={{ fontSize: "16px", marginBottom: "16px" }}>
                            No tickets sold. Buy at least 1 ticket to start a
                            new round!
                          </p>
                          <button
                            onClick={() => buyTicket(1)}
                            disabled={isProcessing}
                            className="btn btn-primary"
                            style={{
                              width: "100%",
                              fontSize: "16px",
                              padding: "14px",
                            }}
                          >
                            {isProcessing
                              ? "Buying..."
                              : "🎟️ Buy 1 Ticket to Start New Round"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-value">{totalTicketsSold}</div>
                        <div className="stat-label">
                          Tickets Sold Last Round
                        </div>
                      </div>
                      <div className="stat-card prize-card">
                        <div className="stat-value">
                          ${prizePool.toFixed(2)}
                        </div>
                        <div className="stat-label">Last Prize Pool</div>
                        <div className="stat-detail">Winner got 90%</div>
                      </div>
                    </div>

                    <div className="purchase-section">
                      <h3>Buy Tickets</h3>
                      <p className="info-text">
                        Each ticket has 2 random numbers (1-50)
                      </p>
                      <p className="info-text">
                        Payment in USDC on Base Network • Owner gets 10% fee
                      </p>

                      {!isContractDeployed() && (
                        <div className="warning-box">
                          <p className="warning-title">
                            ⚠️ Contract Not Deployed
                          </p>
                          <p className="warning-text">
                            Deploy the smart contract first.
                            <br />
                            See <strong>QUICKSTART.txt</strong> for
                            instructions.
                          </p>
                        </div>
                      )}

                      <div className="buy-buttons">
                        <button
                          onClick={() => buyTicket(1)}
                          disabled={isProcessing}
                          className="btn btn-buy"
                        >
                          Buy 1 Ticket
                          <span className="price">$0.10</span>
                        </button>
                        <button
                          onClick={() => buyTicket(5)}
                          disabled={isProcessing}
                          className="btn btn-buy"
                        >
                          Buy 5 Tickets
                          <span className="price">$0.50</span>
                        </button>
                        <button
                          onClick={() => buyTicket(10)}
                          disabled={isProcessing}
                          className="btn btn-buy"
                        >
                          Buy 10 Tickets
                          <span className="price">$1.00</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="timer-section">
                      <div className="timer-card">
                        <span className="timer-label">
                          Round #{currentRoundId} ends in
                        </span>
                        <span className="timer-value">{timeRemaining}</span>
                      </div>
                    </div>

                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-value">{totalTicketsSold}</div>
                        <div className="stat-label">Tickets Sold</div>
                      </div>
                      <div className="stat-card prize-card">
                        <div className="stat-value">
                          ${prizePool.toFixed(2)}
                        </div>
                        <div className="stat-label">Prize Pool</div>
                        <div className="stat-detail">Winner gets 90%</div>
                      </div>
                    </div>

                    <div className="purchase-section">
                      <h3>Buy Tickets</h3>
                      <p className="info-text">
                        Each ticket has 2 random numbers (1-50)
                      </p>
                      <p className="info-text">
                        Payment in USDC on Base Network • Owner gets 10% fee
                      </p>

                      {!isContractDeployed() && (
                        <div className="warning-box">
                          <p className="warning-title">
                            ⚠️ Contract Not Deployed
                          </p>
                          <p className="warning-text">
                            Deploy the smart contract first.
                            <br />
                            See <strong>QUICKSTART.txt</strong> for
                            instructions.
                          </p>
                        </div>
                      )}

                      <div className="buy-buttons">
                        <button
                          onClick={() => buyTicket(1)}
                          disabled={isProcessing}
                          className="btn btn-buy"
                        >
                          Buy 1 Ticket
                          <span className="price">$0.10</span>
                        </button>
                        <button
                          onClick={() => buyTicket(5)}
                          disabled={isProcessing}
                          className="btn btn-buy"
                        >
                          Buy 5 Tickets
                          <span className="price">$0.50</span>
                        </button>
                        <button
                          onClick={() => buyTicket(10)}
                          disabled={isProcessing}
                          className="btn btn-buy"
                        >
                          Buy 10 Tickets
                          <span className="price">$1.00</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Always show tickets if user has any */}
                {tickets.length > 0 && (
                  <div className="my-tickets-section">
                    <h3>🎫 Your Tickets ({tickets.length})</h3>
                    <div className="tickets-grid">
                      {tickets.map((ticket) => (
                        <div key={ticket.id} className="ticket-card">
                          <div className="ticket-numbers">
                            <span className="ticket-num">
                              {ticket.numbers[0]}
                            </span>
                            <span className="ticket-num">
                              {ticket.numbers[1]}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "history" && (
              <div className="history-section">
                <h3>My Round History</h3>
                {userHistory.length === 0 ? (
                  <p className="empty-state">No rounds played yet</p>
                ) : (
                  <div className="history-list">
                    {userHistory.map((round) => (
                      <div
                        key={round.roundId}
                        className={`history-item ${
                          round.isWinner ? "winner" : ""
                        }`}
                      >
                        <div className="history-header">
                          <span className="round-number">
                            Round #{round.roundId}
                          </span>
                          {round.isWinner && (
                            <span className="winner-badge">🏆 Winner</span>
                          )}
                        </div>
                        {round.ended && (
                          <>
                            <div className="history-numbers">
                              <span className="label">Winning Numbers:</span>
                              <div className="numbers">
                                <span className="num">
                                  {round.winningNumber1}
                                </span>
                                <span className="num">
                                  {round.winningNumber2}
                                </span>
                              </div>
                            </div>
                            {round.isWinner && (
                              <div className="history-prize">
                                <div style={{ marginBottom: "10px" }}>
                                  Won: ${round.winnerPrize.toFixed(2)} USDC
                                </div>
                                {!round.prizeClaimed ? (
                                  <button
                                    onClick={() => claimWinnings(round.roundId)}
                                    disabled={isProcessing}
                                    className="btn btn-primary"
                                    style={{
                                      width: "100%",
                                      padding: "10px 20px",
                                      fontSize: "15px",
                                      fontWeight: "600",
                                    }}
                                  >
                                    {isProcessing
                                      ? "Claiming..."
                                      : "🎁 Claim Winnings"}
                                  </button>
                                ) : (
                                  <div
                                    style={{
                                      padding: "10px",
                                      background: "rgba(34, 197, 94, 0.1)",
                                      borderRadius: "8px",
                                      color: "#22c55e",
                                      textAlign: "center",
                                      fontWeight: "600",
                                    }}
                                  >
                                    ✅ Prize Claimed
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "stats" && (
              <div className="stats-section">
                <h3>My Statistics</h3>
                <div className="stats-cards">
                  <div className="stat-card-large">
                    <div className="stat-icon">💰</div>
                    <div className="stat-content">
                      <div className="stat-value">
                        ${userStats.totalSpent.toFixed(2)}
                      </div>
                      <div className="stat-label">Total Spent</div>
                    </div>
                  </div>
                  <div className="stat-card-large">
                    <div className="stat-icon">🏆</div>
                    <div className="stat-content">
                      <div className="stat-value">
                        ${userStats.totalWon.toFixed(2)}
                      </div>
                      <div className="stat-label">Total Won</div>
                    </div>
                  </div>
                  <div
                    className={`stat-card-large pnl-card ${
                      userStats.pnl >= 0 ? "profit" : "loss"
                    }`}
                  >
                    <div className="stat-icon">
                      {userStats.pnl >= 0 ? "📈" : "📉"}
                    </div>
                    <div className="stat-content">
                      <div className="stat-value">
                        {userStats.pnl >= 0 ? "+" : ""}$
                        {userStats.pnl.toFixed(2)}
                      </div>
                      <div className="stat-label">Profit/Loss</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <footer className="footer">
          <p>Powered by Base • USDC • Farcaster</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
