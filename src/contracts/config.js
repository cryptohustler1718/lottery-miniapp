// Base Network Configuration
export const BASE_CHAIN_ID = 8453; // Base Mainnet
export const BASE_RPC_URL = "https://mainnet.base.org";

// USDC Contract on Base Mainnet
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Lottery Contract Address (Update this after deployment)
// IMPORTANT: Deploy the contract first using Remix or Foundry
// Deploy to Base Mainnet and update this address
export const LOTTERY_CONTRACT_ADDRESS =
  "0x12fb80530E92d5804feD44A0C2daA11497CC6143"; // REPLACE WITH MAINNET DEPLOYED ADDRESS

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
