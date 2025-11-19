import express from "express";
import cron from "node-cron";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Contract ABI (only the functions we need)
const LOTTERY_ABI = [
  "function endRound() external",
  "function getCurrentRound() external view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 totalTickets, uint256 prizePool, bool ended)",
  "function currentRoundId() external view returns (uint256)",
];

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(
  process.env.LOTTERY_CONTRACT_ADDRESS,
  LOTTERY_ABI,
  wallet
);

console.log("🎰 Lottery Backend Service Starting...");
console.log("📍 Contract:", process.env.LOTTERY_CONTRACT_ADDRESS);
console.log("👛 Wallet:", wallet.address);

// Check wallet balance on startup
async function checkBalance() {
  try {
    const balance = await provider.getBalance(wallet.address);
    const ethBalance = ethers.formatEther(balance);
    console.log(`💰 Wallet Balance: ${ethBalance} ETH`);

    if (parseFloat(ethBalance) < 0.001) {
      console.warn(
        "⚠️  WARNING: Wallet balance is low! Add more ETH to continue operations."
      );
    }
  } catch (error) {
    console.error("❌ Error checking balance:", error.message);
  }
}

// Function to check and end round if needed
async function checkAndEndRound() {
  try {
    console.log("🔍 Checking if round needs to end...");

    // Get current round info
    const roundData = await contract.getCurrentRound();
    const [roundId, startTime, endTime, totalTickets, prizePool, ended] =
      roundData;

    const now = Math.floor(Date.now() / 1000);
    const roundNumber = Number(roundId);
    const ticketCount = Number(totalTickets);

    console.log(
      `📊 Round #${roundNumber} - Tickets: ${ticketCount}, Ended: ${ended}`
    );

    // Check if round should be ended
    if (now >= Number(endTime) && !ended && ticketCount > 0) {
      console.log(
        `⏰ Round #${roundNumber} expired with ${ticketCount} tickets. Ending round...`
      );

      // Call endRound()
      const tx = await contract.endRound();
      console.log(`📤 Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(
        `✅ Round #${roundNumber} ended successfully! Gas used: ${receipt.gasUsed.toString()}`
      );

      // Check new balance
      await checkBalance();

      return true;
    } else if (now >= Number(endTime) && ticketCount === 0) {
      console.log(
        `ℹ️  Round #${roundNumber} expired with no tickets - skipping`
      );
      return false;
    } else {
      const timeLeft = Number(endTime) - now;
      const minutesLeft = Math.floor(timeLeft / 60);
      console.log(
        `⏳ Round #${roundNumber} still active - ${minutesLeft} minutes remaining`
      );
      return false;
    }
  } catch (error) {
    console.error("❌ Error in checkAndEndRound:", error.message);

    // Log more details for specific errors
    if (error.code === "INSUFFICIENT_FUNDS") {
      console.error(
        "💸 CRITICAL: Insufficient funds for gas! Add ETH to wallet:",
        wallet.address
      );
    } else if (error.code === "NONCE_EXPIRED") {
      console.error(
        "🔄 Nonce error - transaction may have been sent by another process"
      );
    }

    return false;
  }
}

// Schedule cron job to run every minute
cron.schedule("* * * * *", async () => {
  console.log("\n🔔 Cron job triggered at", new Date().toLocaleString());
  await checkAndEndRound();
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const balance = await provider.getBalance(wallet.address);
    const roundData = await contract.getCurrentRound();

    res.json({
      status: "ok",
      wallet: wallet.address,
      balance: ethers.formatEther(balance),
      currentRound: Number(roundData[0]),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Manual trigger endpoint (for testing)
app.post("/trigger-end-round", async (req, res) => {
  try {
    console.log("🎯 Manual trigger requested");
    const result = await checkAndEndRound();

    res.json({
      success: result,
      message: result ? "Round ended successfully" : "No action needed",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`\n🚀 Backend server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(
    `🎯 Manual trigger: POST http://localhost:${PORT}/trigger-end-round`
  );
  console.log("\n⏰ Cron job scheduled to run every minute\n");

  // Check balance on startup
  await checkBalance();

  // Do initial check
  console.log("🔍 Running initial round check...\n");
  await checkAndEndRound();
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit(0);
});
