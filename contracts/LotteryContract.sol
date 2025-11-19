// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract HourlyLottery {
    IERC20 public usdcToken;
    address public owner;
    
    uint256 public constant TICKET_PRICE = 100000; // 0.1 USDC (6 decimals)
    uint256 public constant ROUND_DURATION = 2 minutes;
    
    struct Ticket {
        address owner;
        uint8 number1;
        uint8 number2;
    }
    
    struct Round {
        uint256 startTime;
        uint256 endTime;
        uint256 totalTickets;
        uint256 prizePool;
        bool ended;
        uint8 winningNumber1;
        uint8 winningNumber2;
        address winner;
        uint256 winnerPrize;
        bool prizeClaimed;
    }
    
    struct UserStats {
        uint256 totalSpent;
        uint256 totalWon;
        uint256 roundsParticipated;
    }
    
    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Ticket[]) public roundTickets;
    mapping(address => UserStats) public userStats;
    mapping(address => uint256[]) public userRoundHistory; // Rounds user participated in
    
    event TicketPurchased(uint256 indexed roundId, address indexed buyer, uint8 number1, uint8 number2);
    event RoundEnded(uint256 indexed roundId, address indexed winner, uint256 prize);
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    
    constructor(address _usdcToken) {
        usdcToken = IERC20(_usdcToken);
        owner = msg.sender;
        startNewRound();
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    function startNewRound() internal {
        currentRoundId++;
        rounds[currentRoundId] = Round({
            startTime: block.timestamp,
            endTime: block.timestamp + ROUND_DURATION,
            totalTickets: 0,
            prizePool: 0,
            ended: false,
            winningNumber1: 0,
            winningNumber2: 0,
            winner: address(0),
            winnerPrize: 0,
            prizeClaimed: false
        });
        
        emit RoundStarted(currentRoundId, rounds[currentRoundId].startTime, rounds[currentRoundId].endTime);
    }
    
    function buyTickets(uint8[] calldata numbers1, uint8[] calldata numbers2) external {
        require(numbers1.length == numbers2.length, "Arrays length mismatch");
        require(numbers1.length > 0, "Must buy at least 1 ticket");
        
        Round storage round = rounds[currentRoundId];
        
        // Auto-end previous round if time expired and start new one
        if (block.timestamp >= round.endTime && !round.ended) {
            if (round.totalTickets > 0) {
                // End the round with tickets
                _endRound();
                round = rounds[currentRoundId]; // Get the new round
            } else {
                // No tickets sold, just start fresh round
                startNewRound();
                round = rounds[currentRoundId];
            }
        }
        
        require(!round.ended, "Round has ended");
        require(block.timestamp < round.endTime, "Round time expired");
        
        uint256 totalCost = TICKET_PRICE * numbers1.length;
        
        // Transfer USDC from buyer (single transaction)
        require(
            usdcToken.transferFrom(msg.sender, address(this), totalCost),
            "USDC transfer failed"
        );
        
        // Track if this is user's first ticket in this round
        bool firstTicketInRound = true;
        for (uint256 i = 0; i < roundTickets[currentRoundId].length; i++) {
            if (roundTickets[currentRoundId][i].owner == msg.sender) {
                firstTicketInRound = false;
                break;
            }
        }
        
        if (firstTicketInRound) {
            userRoundHistory[msg.sender].push(currentRoundId);
            userStats[msg.sender].roundsParticipated++;
        }
        
        // Add all tickets
        for (uint256 i = 0; i < numbers1.length; i++) {
            require(numbers1[i] >= 1 && numbers1[i] <= 50, "Number 1 out of range");
            require(numbers2[i] >= 1 && numbers2[i] <= 50, "Number 2 out of range");
            require(numbers1[i] != numbers2[i], "Numbers must be different");
            
            uint8 num1 = numbers1[i] < numbers2[i] ? numbers1[i] : numbers2[i];
            uint8 num2 = numbers1[i] < numbers2[i] ? numbers2[i] : numbers1[i];
            
            roundTickets[currentRoundId].push(Ticket({
                owner: msg.sender,
                number1: num1,
                number2: num2
            }));
            
            emit TicketPurchased(currentRoundId, msg.sender, num1, num2);
        }
        
        round.totalTickets += numbers1.length;
        round.prizePool += totalCost;
        userStats[msg.sender].totalSpent += totalCost;
    }
    
    function _endRound() internal {
        Round storage round = rounds[currentRoundId];
        require(round.totalTickets > 0, "No tickets sold");
        require(!round.ended, "Round already ended");
        
        // Select winning ticket to ensure there's a winner
        uint256 randomIndex = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, currentRoundId))) % round.totalTickets;
        Ticket memory winningTicket = roundTickets[currentRoundId][randomIndex];
        
        round.winningNumber1 = winningTicket.number1;
        round.winningNumber2 = winningTicket.number2;
        
        // Find all winners with matching numbers
        address[] memory winners = new address[](round.totalTickets);
        uint256 winnerCount = 0;
        
        for (uint256 i = 0; i < round.totalTickets; i++) {
            Ticket memory ticket = roundTickets[currentRoundId][i];
            if (ticket.number1 == round.winningNumber1 && ticket.number2 == round.winningNumber2) {
                winners[winnerCount] = ticket.owner;
                winnerCount++;
            }
        }
        
        require(winnerCount > 0, "No winner found");
        
        // Select one winner if multiple
        address selectedWinner = winners[0];
        if (winnerCount > 1) {
            uint256 winnerIndex = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, currentRoundId, "winner"))) % winnerCount;
            selectedWinner = winners[winnerIndex];
        }
        
        round.winner = selectedWinner;
        round.ended = true;
        
        // Calculate prizes
        uint256 winnerPrize = (round.prizePool * 90) / 100;
        uint256 ownerFee = round.prizePool - winnerPrize;
        
        round.winnerPrize = winnerPrize;
        
        // Update winner stats (pending claim)
        userStats[selectedWinner].totalWon += winnerPrize;
        
        // Transfer owner fee immediately, winner claims later
        require(usdcToken.transfer(owner, ownerFee), "Owner transfer failed");
        
        emit RoundEnded(currentRoundId, selectedWinner, winnerPrize);
        
        // Start new round immediately
        startNewRound();
    }
    
    function claimWinnings(uint256 roundId) external {
        Round storage round = rounds[roundId];
        require(round.ended, "Round not ended");
        require(round.winner == msg.sender, "Not the winner");
        require(!round.prizeClaimed, "Prize already claimed");
        require(round.winnerPrize > 0, "No prize to claim");
        
        round.prizeClaimed = true;
        
        // Transfer winnings to winner
        require(usdcToken.transfer(msg.sender, round.winnerPrize), "Transfer failed");
    }
    
    function endRound() external {
        Round storage round = rounds[currentRoundId];
        require(block.timestamp >= round.endTime, "Round not finished");
        require(!round.ended, "Round already ended");
        require(round.totalTickets > 0, "No tickets sold");
        
        _endRound();
    }
    
    function getCurrentRound() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 totalTickets,
        uint256 prizePool,
        bool ended
    ) {
        Round memory round = rounds[currentRoundId];
        
        // Check if time has expired but round not ended yet
        bool actuallyEnded = round.ended || (block.timestamp >= round.endTime && round.totalTickets == 0);
        
        return (
            currentRoundId,
            round.startTime,
            round.endTime,
            round.totalTickets,
            round.prizePool,
            actuallyEnded
        );
    }
    
    function getTicketsForRound(uint256 roundId) external view returns (Ticket[] memory) {
        return roundTickets[roundId];
    }
    
    function getUserTicketsForCurrentRound(address user) external view returns (Ticket[] memory) {
        Ticket[] memory allTickets = roundTickets[currentRoundId];
        uint256 userTicketCount = 0;
        
        // Count user tickets
        for (uint256 i = 0; i < allTickets.length; i++) {
            if (allTickets[i].owner == user) {
                userTicketCount++;
            }
        }
        
        // Create array of user tickets
        Ticket[] memory userTickets = new Ticket[](userTicketCount);
        uint256 index = 0;
        for (uint256 i = 0; i < allTickets.length; i++) {
            if (allTickets[i].owner == user) {
                userTickets[index] = allTickets[i];
                index++;
            }
        }
        
        return userTickets;
    }
    
    function getContractBalance() external view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }
    
    function getUserStats(address user) external view returns (uint256 totalSpent, uint256 totalWon, uint256 roundsParticipated, int256 pnl) {
        UserStats memory stats = userStats[user];
        return (stats.totalSpent, stats.totalWon, stats.roundsParticipated, int256(stats.totalWon) - int256(stats.totalSpent));
    }
    
    function getUserRoundHistory(address user) external view returns (uint256[] memory) {
        return userRoundHistory[user];
    }
    
    function getRoundDetails(uint256 roundId) external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 totalTickets,
        uint256 prizePool,
        bool ended,
        uint8 winningNumber1,
        uint8 winningNumber2,
        address winner,
        uint256 winnerPrize,
        bool prizeClaimed
    ) {
        Round memory round = rounds[roundId];
        return (
            round.startTime,
            round.endTime,
            round.totalTickets,
            round.prizePool,
            round.ended,
            round.winningNumber1,
            round.winningNumber2,
            round.winner,
            round.winnerPrize,
            round.prizeClaimed
        );
    }
}
