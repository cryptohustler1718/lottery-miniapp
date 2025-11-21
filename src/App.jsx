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
      
      // Request accounts using EIP-1193 standard
      const accounts = await ethProvider.request({
        method: "eth_requestAccounts",
        params: [],
      });

      const address = accounts[0];
      console.log("Connected address:", address);

      // Check current network BEFORE trying to switch
      const network = await web3Provider.getNetwork();
      console.log("Current chain ID:", network.chainId);

      // Only try to switch if not on Base already
      if (Number(network.chainId) !== BASE_CHAIN_ID) {
        try {
          await switchToBase(ethProvider);
          console.log("Switched to Base successfully");
        } catch (switchError) {
          console.log("Chain switch failed:", switchError.message);
          alert(`Please manually switch to Base Mainnet in your wallet. Current chain: ${network.chainId}`);
          return;
        }
      }

      const web3Signer = await web3Provider.getSigner();
      
      setProvider(web3Provider);
      setSigner(web3Signer);
      setWalletAddress(address);

      // Check if contract is deployed
      if (!isContractDeployed()) {
        console.log("Contract not deployed yet");
        // Still load USDC balance
        try {
          const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, web3Signer);
          const balance = await usdc.balanceOf(address);
          setUsdcBalance(ethers.formatUnits(balance, 6));
          setUsdcContract(usdc);
          console.log("USDC Balance loaded:", ethers.formatUnits(balance, 6));
        } catch (err) {
          console.error("Failed to load USDC balance:", err);
        }
        return; // Don't try to load lottery contract
      }

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
      console.log("USDC Balance:", ethers.formatUnits(balance, 6));

      // Load round data
      await loadRoundData(lottery, address);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      // Don't show error if user rejected - just log it
      if (error.code === 4001 || error.message.includes("User rejected")) {
        console.log("User rejected connection");
        return;
      }
      alert("Failed to connect: " + (error.reason || error.message));
    }
  };