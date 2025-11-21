// Base Network Configuration
export const BASE_CHAIN_ID = 84532; // Base Sepolia
export const BASE_RPC_URL = "https://sepolia.base.org";

// USDC Contract on Base Sepolia
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Lottery Contract Address (Update this after deployment)
// Using Sepolia for testing
export const LOTTERY_CONTRACT_ADDRESS =
  "0x520066b9340dCEc3A876Cec21973390c9d67ac8f"; // Sepolia contract

// Check if contract is deployed
export const isContractDeployed = () => {
  return (
    LOTTERY_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
    LOTTERY_CONTRACT_ADDRESS !== "0x"
  );
};

// USDC ABI (minimal for approve and transfer)
export const USDC_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)",
  "function decimals() public view returns (uint8)",
  "function transfer(address to, uint256 amount) public returns (bool)",
];

// Lottery Contract ABI
export const LOTTERY_ABI = [
  "function buyTickets(uint8[] calldata numbers1, uint8[] calldata numbers2) external",
  "function endRound() external",
  "function claimWinnings(uint256 roundId) external",
  "function getCurrentRound() external view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 totalTickets, uint256 prizePool, bool ended)",
  "function getUserTicketsForCurrentRound(address user) external view returns (tuple(address owner, uint8 number1, uint8 number2)[])",
  "function getTicketsForRound(uint256 roundId) external view returns (tuple(address owner, uint8 number1, uint8 number2)[])",
  "function currentRoundId() external view returns (uint256)",
  "function rounds(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 totalTickets, uint256 prizePool, bool ended, uint8 winningNumber1, uint8 winningNumber2, address winner, uint256 winnerPrize, bool prizeClaimed)",
  "function getUserStats(address user) external view returns (uint256 totalSpent, uint256 totalWon, uint256 roundsParticipated, int256 pnl)",
  "function getUserRoundHistory(address user) external view returns (uint256[] memory)",
  "function getRoundDetails(uint256 roundId) external view returns (uint256 startTime, uint256 endTime, uint256 totalTickets, uint256 prizePool, bool ended, uint8 winningNumber1, uint8 winningNumber2, address winner, uint256 winnerPrize, bool prizeClaimed)",
  "event TicketPurchased(uint256 indexed roundId, address indexed buyer, uint8 number1, uint8 number2)",
  "event RoundEnded(uint256 indexed roundId, address indexed winner, uint256 prize)",
  "event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime)",
];

export const TICKET_PRICE_USDC = "0.1"; // 0.1 USDC
export const TICKET_PRICE_WEI = "100000"; // 0.1 USDC in wei (6 decimals)
