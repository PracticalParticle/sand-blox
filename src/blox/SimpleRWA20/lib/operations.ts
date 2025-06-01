import { Address, Chain, Hex, PublicClient, WalletClient, keccak256 } from 'viem';
import { TransactionOptions } from '../../../particle-core/sdk/typescript/interfaces/base.index';
import { BaseBloxOperationsHandler } from '../../../types/BloxOperationsHandler';
import { MetaTransaction, TxRecord } from '../../../particle-core/sdk/typescript/interfaces/lib.index';
import { SinglePhaseOperationFunctions } from '../../../types/OperationRegistry';
import SimpleRWA20 from '../SimpleRWA20';
import { SecureOwnable } from '../../../particle-core/sdk/typescript/SecureOwnable';
import { RWA20TxRecord, TokenMetaTxParams } from './types';
import { MetaTransactionManager } from '../../../services/MetaTransactionManager';

/**
 * Get meta transaction settings from local storage
 * @returns TokenMetaTxParams with stored or default settings
 */
export const getStoredMetaTxSettings = (): TokenMetaTxParams => {
  try {
    const stored = localStorage.getItem('simpleRWA20.metaTxSettings');
    if (!stored) return {
      deadline: BigInt(3600), // 1 hour in seconds
      maxGasPrice: BigInt(50000000000) // 50 gwei default
    };
    
    const parsed = JSON.parse(stored);
    // Ensure maxGasPrice is at least 50 gwei
    const maxGasPrice = BigInt(parsed.maxGasPrice) < BigInt(50000000000) 
      ? BigInt(50000000000) 
      : BigInt(parsed.maxGasPrice);
    
    return {
      deadline: BigInt(parsed.deadline),
      maxGasPrice
    };
  } catch (error) {
    console.error('Failed to load meta tx settings:', error);
    return {
      deadline: BigInt(3600),
      maxGasPrice: BigInt(50000000000) // 50 gwei default
    };
  }
};

/**
 * Create TokenMetaTxParams with absolute deadline from settings
 * @param settings TokenMetaTxParams containing relative deadline
 * @returns TokenMetaTxParams with absolute deadline
 */
export const createRWA20MetaTxParams = (settings: TokenMetaTxParams): TokenMetaTxParams => {
  // Get current timestamp in seconds
  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
  
  // Convert deadline from seconds to actual timestamp by adding to current time
  const deadlineTimestamp = currentTimestamp + BigInt(settings.deadline);
  
  return {
    deadline: deadlineTimestamp,
    maxGasPrice: settings.maxGasPrice
  };
};

/**
 * Helper function to compute keccak256 of a string and take first 4 bytes (function selector)
 */
const computeFunctionSelector = (signature: string): Hex => {
  const hash = keccak256(signature as `0x${string}`);
  return `0x${hash.slice(2, 10)}` as Hex;
};

/**
 * Operation handler for SimpleRWA20 Blox
 */
export default class SimpleRWA20OperationsHandler extends BaseBloxOperationsHandler {
  // Operation type constants - use human-readable names
  static readonly MINT_TOKENS = "MINT_TOKENS";
  static readonly BURN_TOKENS = "BURN_TOKENS";
  
  // Function selectors for operations - computed explicitly
  static readonly FUNCTION_SELECTORS = {
    MINT_TOKENS_META_TX: computeFunctionSelector("mintWithMetaTx((uint256,uint256,uint8,(address,address,uint256,uint256,bytes32,uint8,bytes),bytes32,bytes,(address,uint256,address,uint256),(uint256,uint256,address,bytes4,uint256,uint256,address),bytes,bytes))"),
    BURN_TOKENS_META_TX: computeFunctionSelector("burnWithMetaTx((uint256,uint256,uint8,(address,address,uint256,uint256,bytes32,uint8,bytes),bytes32,bytes,(address,uint256,address,uint256),(uint256,uint256,address,bytes4,uint256,uint256,address),bytes,bytes))")
  } as const;

  // Map to store operation type hashes by name
  private operationTypeMap: Map<string, Hex> = new Map();

  protected client!: PublicClient;

  constructor() {
    super("simple-rwa20", ["SimpleRWA20"]);
  }

  /**
   * Register all operations for SimpleRWA20
   */
  async registerOperations(
    contract: SimpleRWA20,
    contractAddress: Address,
    publicClient: PublicClient,
    walletClient?: WalletClient,
    chain?: Chain,
    storeTransaction?: (txId: string, signedData: string, metadata?: Record<string, any>) => void
  ): Promise<void> {
    // Initialize the handler and set the client
    this.initialize(contract, contractAddress, publicClient, walletClient, chain);
    this.client = publicClient; // Explicitly set the client
    this.storeTransaction = storeTransaction;
    
    // Load operation types
    await this.loadOperationTypes();
    
    // Register operations
    this.registerMintTokensOperation(contract);
    this.registerBurnTokensOperation(contract);
  }

  /**
   * Load operation types from contract
   */
  private async loadOperationTypes(): Promise<void> {
    try {
      if (!this.contractAddress || !this.publicClient) {
        throw new Error("Contract address or public client not available");
      }

      // Create an instance of SecureOwnable to access the contract's operation types
      if (!this.chain) {
        throw new Error("Chain information is required to load operation types");
      }

      const secureOwnable = new SecureOwnable(
        this.publicClient, 
        this.walletClient || undefined, 
        this.contractAddress, 
        this.chain
      );
      
      // Fetch operation types from the contract
      const types = await secureOwnable.getSupportedOperationTypes();
      
      // Create a map of operation names to operation type hashes
      types.forEach(({ operationType, name }) => {
        const normalizedName = name.toUpperCase().replace(/\s/g, '_');
        this.operationTypeMap.set(normalizedName, operationType as Hex);
      });
      
      // Validate that all required operation types are available
      const requiredTypes = [
        SimpleRWA20OperationsHandler.MINT_TOKENS,
        SimpleRWA20OperationsHandler.BURN_TOKENS
      ];
      
      const missingTypes = requiredTypes.filter(type => !this.operationTypeMap.has(type));
      if (missingTypes.length > 0) {
        console.warn(`Some required operation types are missing from contract: ${missingTypes.join(', ')}`);
        
        // Attempt to find close matches by name similarity
        types.forEach(({ operationType, name }) => {
          for (const missingType of missingTypes) {
            // Check if the contract-provided name contains parts of our expected names
            if (name.toUpperCase().includes(missingType.replace(/_/g, ' ')) || 
                missingType.includes(name.toUpperCase().replace(/\s/g, '_'))) {
              console.log(`Using "${name}" (${operationType}) for "${missingType}"`);
              this.operationTypeMap.set(missingType, operationType as Hex);
            }
          }
        });
      }
      
      console.log(`Loaded ${this.operationTypeMap.size} operation types for SimpleRWA20`);
    } catch (error) {
      console.error('Failed to load operation types for SimpleRWA20:', error);
      throw error;
    }
  }

  /**
   * Get operation type hash by name
   */
  private getOperationTypeHash(name: string): Hex {
    const hash = this.operationTypeMap.get(name);
    if (!hash) {
      throw new Error(`Operation type hash not found for name: ${name}`);
    }
    return hash;
  }

  /**
   * Register the MINT_TOKENS operation
   */
  private registerMintTokensOperation(contract: SimpleRWA20): void {
    // Define the functions for the mint tokens operation
    const functions: SinglePhaseOperationFunctions = {
      // For mint, we only have the meta transaction function, as minting is single-phase
      requestAndApproveWithMetaTx: async (metaTx: MetaTransaction, options: TransactionOptions) => {
        if (!this.walletClient?.account) {
          throw new Error("Wallet not connected");
        }
        return contract.mintWithMetaTx(metaTx, options);
      }
    };
    
    try {
      // Get operation hash from name
      const operationTypeHash = this.getOperationTypeHash(SimpleRWA20OperationsHandler.MINT_TOKENS);
      
      // Register the operation as single-phase
      this.registerSinglePhaseOperation(
        SimpleRWA20OperationsHandler.MINT_TOKENS,
        operationTypeHash,
        "MINT_TOKENS",
        "Mint tokens to a specified address",
        SimpleRWA20OperationsHandler.FUNCTION_SELECTORS.MINT_TOKENS_META_TX,
        functions,
        {
          request: 'owner'
        }
      );
    } catch (error) {
      console.error(`Failed to register MINT_TOKENS operation: ${error}`);
    }
  }

  /**
   * Register the BURN_TOKENS operation
   */
  private registerBurnTokensOperation(contract: SimpleRWA20): void {
    // Define the functions for the burn tokens operation
    const functions: SinglePhaseOperationFunctions = {
      // For burn, we only have the meta transaction function, as burning is single-phase
      requestAndApproveWithMetaTx: async (metaTx: MetaTransaction, options: TransactionOptions) => {
        if (!this.walletClient?.account) {
          throw new Error("Wallet not connected");
        }
        return contract.burnWithMetaTx(metaTx, options);
      }
    };
    
    try {
      // Get operation hash from name
      const operationTypeHash = this.getOperationTypeHash(SimpleRWA20OperationsHandler.BURN_TOKENS);
      
      // Register the operation as single-phase
      this.registerSinglePhaseOperation(
        SimpleRWA20OperationsHandler.BURN_TOKENS,
        operationTypeHash,
        "BURN_TOKENS",
        "Burn tokens from a specified address",
        SimpleRWA20OperationsHandler.FUNCTION_SELECTORS.BURN_TOKENS_META_TX,
        functions,
        {
          request: 'owner'
        }
      );
    } catch (error) {
      console.error(`Failed to register BURN_TOKENS operation: ${error}`);
    }
  }

  /**
   * Handler for approval actions - Required by BaseBloxOperationsHandler
   * Not applicable for RWA20 tokens, but must be implemented
   */
  async handleApprove(_txId: number): Promise<void> {
    throw new Error("Direct approval not applicable for SimpleRWA20. Use mint or burn operations instead.");
  }

  /**
   * Handler for cancellation actions - Required by BaseBloxOperationsHandler
   * Not applicable for RWA20 tokens, but must be implemented
   */
  async handleCancel(_txId: number): Promise<void> {
    throw new Error("Direct cancellation not applicable for SimpleRWA20. Use mint or burn operations instead.");
  }

  /**
   * Handle meta-transaction signing - This is our custom implementation for SimpleRWA20
   * Uses different type parameters than the base class
   */
  async handleRWA20MetaTxSign(tx: TxRecord, type: 'mint' | 'burn'): Promise<void> {
    if (!this.contract || !this.contractAddress || !this.walletClient?.account) {
      throw new Error("Contract not initialized");
    }

    const contract = this.contract as SimpleRWA20;
    
    // Get stored settings and create meta tx params
    const storedSettings = getStoredMetaTxSettings();
    const metaTxParams = createRWA20MetaTxParams(storedSettings);
    
    let unsignedMetaTx;
    
    // Parameters for the meta-transaction
    if (type === 'mint') {
      // Parameters for minting
      const to = tx.params.target as Address;
      const amount = BigInt(tx.params.value);
      
      // Generate unsigned meta-transaction
      unsignedMetaTx = await contract.generateUnsignedMintMetaTx(
        to,
        amount,
        metaTxParams
      );
    } else {
      // Parameters for burning
      const from = tx.params.target as Address;
      const amount = BigInt(tx.params.value);
      
      // Generate unsigned meta-transaction
      unsignedMetaTx = await contract.generateUnsignedBurnMetaTx(
        from,
        amount,
        metaTxParams
      );
    }
    
    // Get the message hash and sign it
    const messageHash = unsignedMetaTx.message;
    const signature = await this.walletClient.signMessage({
      message: { raw: messageHash as Hex },
      account: this.walletClient.account.address
    });

    // Create the complete signed meta transaction
    const signedMetaTx = {
      ...unsignedMetaTx,
      signature
    };

    // Convert BigInt values to strings recursively
    const serializableMetaTx = JSON.parse(
      JSON.stringify(signedMetaTx, (_, value) => 
        typeof value === 'bigint' ? value.toString() : value
      )
    );

    // Store the transaction if storeTransaction is provided
    if (this.storeTransaction) {
      // Get operation name for the transaction type
      const operationName = type === 'mint' ? 'MINT_TOKENS' : 'BURN_TOKENS';
      
      this.storeTransaction(
        tx.txId.toString(),
        JSON.stringify(serializableMetaTx),
        {
          type: operationName,
          timestamp: Date.now(),
          action: type,
          broadcasted: false,
          status: 'PENDING',
          operationType: tx.params.operationType,
          bloxId: this.bloxId
        }
      );
    }
  }

  /**
   * Implementation of required handleMetaTxSign method from base class
   * Maps to our custom RWA20 implementation with fixed parameters
   */
  async handleMetaTxSign(tx: TxRecord, type: 'approve' | 'cancel'): Promise<void> {
    // We adapt the base class interface to our token-specific implementation
    if (type === 'approve') {
      await this.handleRWA20MetaTxSign(tx, 'mint');
    } else {
      await this.handleRWA20MetaTxSign(tx, 'burn');
    }
  }

  /**
   * Get operation types for this handler
   */
  private getOperationTypes(): Map<Hex, string> {
    const types = new Map<Hex, string>();
    types.set(this.getOperationTypeHash(SimpleRWA20OperationsHandler.MINT_TOKENS), SimpleRWA20OperationsHandler.MINT_TOKENS);
    types.set(this.getOperationTypeHash(SimpleRWA20OperationsHandler.BURN_TOKENS), SimpleRWA20OperationsHandler.BURN_TOKENS);
    return types;
  }

  /**
   * Implementation of required handleBroadcast method from base class
   * Maps to our custom RWA20 implementation with fixed parameters
   */
  async handleBroadcast(tx: TxRecord, _type: 'approve' | 'cancel'): Promise<void> {
    // Map approve/cancel to mint/burn for RWA20
    const operationType = tx.params.operationType as Hex;
    const operationTypes = this.getOperationTypes();
    
    if (!operationTypes.has(operationType)) {
      throw new Error("Invalid operation type for broadcast");
    }

    const operationName = operationTypes.get(operationType);
    if (operationName === SimpleRWA20OperationsHandler.MINT_TOKENS) {
      await this.handleRWA20Broadcast(tx, 'mint');
    } else if (operationName === SimpleRWA20OperationsHandler.BURN_TOKENS) {
      await this.handleRWA20Broadcast(tx, 'burn');
    } else {
      throw new Error("Unsupported operation type for broadcast");
    }
  }

  async handleRWA20Broadcast(tx: TxRecord, type: 'mint' | 'burn'): Promise<void> {
    if (!this.contract || !this.contractAddress || !this.walletClient?.account) {
      throw new Error("Contract not initialized");
    }

    if (!this.client) {
      throw new Error("Public client not initialized");
    }

    const contract = this.contract as SimpleRWA20;
    
    // Get the stored transaction data
    const txId = tx.txId.toString();
    console.log(`Processing ${type} transaction #${txId}`);
    
    // Get the stored transaction from localStorage
    const storedTxKey = `dapp_signed_transactions`;
    const storedData = localStorage.getItem(storedTxKey);
    
    if (!storedData) {
      throw new Error("No stored transactions found");
    }

    const parsedData = JSON.parse(storedData);
    const contractTransactions = parsedData[this.contractAddress];
    
    if (!contractTransactions || !contractTransactions[txId]) {
      throw new Error(`No stored transaction found for ID: ${txId}`);
    }

    const storedTx = contractTransactions[txId];
    console.log(`Found stored transaction:`, storedTx);
    
    let signedMetaTx;
    let originalMetaTx;
    
    try {
      // First parse the original signed data without any conversions
      originalMetaTx = JSON.parse(storedTx.signedData);
      
      // Use bigIntReplacer for logging
      console.log(`Original meta-tx structure:`, JSON.stringify(originalMetaTx, this.bigIntReplacer, 2));
      
      // Make a deep copy for safer manipulation
      signedMetaTx = JSON.parse(JSON.stringify(originalMetaTx));
      
      // Validate required fields
      if (!signedMetaTx.message || !signedMetaTx.signature || !signedMetaTx.params) {
        throw new Error("Invalid meta transaction data structure");
      }
      
      // Select the correct function selector based on operation type
      const metaTxSelector = type === 'mint' 
        ? SimpleRWA20OperationsHandler.FUNCTION_SELECTORS.MINT_TOKENS_META_TX
        : SimpleRWA20OperationsHandler.FUNCTION_SELECTORS.BURN_TOKENS_META_TX;
      
      // Ensure the handler selector is correct
      console.log(`Checking meta-tx selector: ${signedMetaTx.params.handlerSelector} vs expected: ${metaTxSelector}`);
      if (signedMetaTx.params.handlerSelector !== metaTxSelector) {
        console.warn(`Correcting handler selector from ${signedMetaTx.params.handlerSelector} to ${metaTxSelector}`);
        signedMetaTx.params.handlerSelector = metaTxSelector;
      }
      
      // Verify broadcaster role before proceeding
      console.log(`Verifying broadcaster role for ${this.walletClient.account.address}`);
      const secureOwnable = new SecureOwnable(
        this.client,
        this.walletClient,
        this.contractAddress,
        this.chain as Chain
      );
      
      // Get the broadcaster address from the contract
      const broadcasterAddress = await secureOwnable.getBroadcaster();
      console.log(`Contract broadcaster address: ${broadcasterAddress}`);
      
      // Check if current wallet is the broadcaster
      if (this.walletClient.account.address.toLowerCase() !== broadcasterAddress.toLowerCase()) {
        throw new Error(`Only the broadcaster can execute this transaction. Current account (${this.walletClient.account.address}) is not the broadcaster (${broadcasterAddress})`);
      }
      
      console.log(`Confirmed broadcaster role for account: ${this.walletClient.account.address}`);
      
      // Validate deadline first to avoid unnecessary gas price check if expired
      const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
      if (BigInt(signedMetaTx.params.deadline) < currentTimestamp) {
        throw new Error(`Meta transaction has expired. Current time: ${currentTimestamp}, Deadline: ${signedMetaTx.params.deadline}`);
      }

      // Get current gas price and validate
      const currentGasPrice = await this.client.getGasPrice();
      if (!currentGasPrice) {
        throw new Error("Failed to get current gas price");
      }

      // Log the gas prices for debugging
      console.log(`Current gas price: ${currentGasPrice} wei`);
      console.log(`Max gas price in metaTx: ${signedMetaTx.params.maxGasPrice} wei`);
      
      if (currentGasPrice > BigInt(signedMetaTx.params.maxGasPrice)) {
        throw new Error(`Current gas price (${currentGasPrice} wei) exceeds maximum allowed in meta-transaction (${signedMetaTx.params.maxGasPrice} wei)`);
      }

      // Get current chain ID to make sure we're on the right network
      const currentChainId = await this.client.getChainId();
      const expectedChainId = this.chain?.id;
      console.log(`Current chain ID: ${currentChainId}, Expected chain ID: ${expectedChainId}`);
      
      if (expectedChainId && currentChainId !== expectedChainId) {
        throw new Error(`Network mismatch: Connected to chain ID ${currentChainId} but expected ${expectedChainId}`);
      }

      // Set higher gas limit and explicit gas price
      const gasLimit = BigInt(3000000); // 3M gas to be safe
      const gasPrice = await this.client.getGasPrice();
      const safeGasPrice = gasPrice * BigInt(12) / BigInt(10); // Add 20% buffer
      
      // Create a properly typed object by converting string values to BigInts
      const metaTxWithBigInts = {
        ...signedMetaTx,
        params: {
          ...signedMetaTx.params,
          chainId: BigInt(signedMetaTx.params.chainId),
          nonce: BigInt(signedMetaTx.params.nonce),
          deadline: BigInt(signedMetaTx.params.deadline),
          maxGasPrice: BigInt(signedMetaTx.params.maxGasPrice)
        }
      };

      // Log the full meta transaction data for debugging using bigIntReplacer
      console.log('Full meta transaction data:', JSON.stringify(metaTxWithBigInts, this.bigIntReplacer, 2));

      // Prepare transaction options with explicit gas parameters
      const transactionOptions = { 
        from: this.walletClient.account.address,
        gas: Number(gasLimit),
        gasPrice: safeGasPrice.toString(),
        chain: this.chain
      };
      
      console.log('Transaction options:', transactionOptions);

      // Execute the transaction through contract methods
      let result;
      if (type === 'mint') {
        console.log('Executing mintWithMetaTx...');
        result = await contract.mintWithMetaTx(
          metaTxWithBigInts,
          transactionOptions
        );
      } else {
        console.log('Executing burnWithMetaTx...');
        result = await contract.burnWithMetaTx(
          metaTxWithBigInts,
          transactionOptions
        );
      }
      
      console.log(`Transaction submitted: ${result.hash}`);
      
      // Wait for confirmation with timeout
      const receipt = await Promise.race([
        result.wait(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
        )
      ]);
      
      console.log('Transaction receipt:', receipt);
      
      // Remove the transaction after successful broadcast
      if (this.storeTransaction) {
        console.log(`Removing transaction ${txId} from storage after successful broadcast`);
        const txManager = new MetaTransactionManager();
        txManager.removeSignedTransaction(this.contractAddress, txId);
      }
    } catch (error) {
      console.error('Broadcast error:', error);
      
      // Try to extract Solidity revert reason if possible
      let revertReason = '';
      try {
        if (this.client && error instanceof Error && error.message.includes('0x')) {
          // Try to find a transaction hash in the error message
          const hashMatch = error.message.match(/0x[a-fA-F0-9]{64}/);
          if (hashMatch && hashMatch[0]) {
            const txHash = hashMatch[0] as `0x${string}`;
            console.log(`Attempting to get revert reason for transaction: ${txHash}`);
            
            // Get transaction receipt
            const receipt = await this.client.getTransactionReceipt({ hash: txHash });
            
            if (receipt && receipt.status === 'reverted') {
              // Try to simulate to get revert reason
              try {
                const tx = await this.client.getTransaction({ hash: txHash });
                if (tx) {
                  console.log(`Simulating transaction to get revert reason`);
                  await this.client.call({
                    to: tx.to as `0x${string}`,
                    data: tx.input,
                    account: tx.from
                  });
                }
              } catch (simulateError: any) {
                if (typeof simulateError.message === 'string') {
                  const reasonMatch = simulateError.message.match(/reason="([^"]+)"/);
                  if (reasonMatch && reasonMatch[1]) {
                    revertReason = reasonMatch[1];
                    console.log(`Found revert reason: ${revertReason}`);
                  }
                }
              }
            }
          }
        }
      } catch (revertReasonError) {
        console.error('Failed to get revert reason:', revertReasonError);
      }
      
      let errorMessage = "Transaction failed: ";
      
      if (revertReason) {
        errorMessage += revertReason;
      } else if (error instanceof Error) {
        // Check for common errors and provide more helpful messages
        if (error.message.includes('UNPREDICTABLE_GAS_LIMIT')) {
          errorMessage += "Gas estimation failed - contract execution would revert. Check parameters and contract state.";
        } else if (error.message.includes('CALL_EXCEPTION')) {
          errorMessage += "Contract execution reverted - check parameters and contract state.";
        } else if (error.message.includes('MetaTransaction verification failed')) {
          errorMessage += "Meta-transaction verification failed - signature or parameters invalid.";
        } else if (error.message.includes('Invalid')) {
          errorMessage += error.message;
        } else if (error.message.includes('execution reverted')) {
          // Extract the revert reason if available
          const revertReason = error.message.match(/execution reverted: (.*?)(?:,|$)/);
          errorMessage += revertReason ? revertReason[1] : "Execution reverted";
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += String(error);
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Convert a TxRecord to a RWA20TxRecord
   */
  convertRecord(record: TxRecord): RWA20TxRecord | null {
    try {
      const operationName = this.getOperationName(record);
      
      // Only convert if this is a mint or burn operation
      if (operationName !== 'MINT_TOKENS' && operationName !== 'BURN_TOKENS') {
        return null;
      }
      
      // Extract needed parameters from the transaction record
      const isMintOperation = operationName === 'MINT_TOKENS';
      
      // Type assertion for dynamic access to params
      const params = record.params as any;
      
      console.log('Full transaction params:', params);
      
      // The "to" address for mint or "from" address for burn is stored in params.target
      if (!params.target) {
        console.error('Missing "target" address in transaction params:', params);
        throw new Error('Missing "target" address in transaction params');
      }
      
      // The amount is stored in params.value
      if (params.value === undefined) {
        console.error('Missing "value" in transaction params:', params);
        throw new Error('Missing "value" in transaction params');
      }

      // Convert address and amount to appropriate types
      const targetAddress = params.target as `0x${string}`;
      const amountBigInt = BigInt(params.value);
      
      // Initial assignment of required 'to' field
      let toAddress: `0x${string}` = '0x0000000000000000000000000000000000000000';
      let fromAddress: `0x${string}` | undefined = undefined;
      
      // Set to/from based on operation type
      if (isMintOperation) {
        toAddress = targetAddress;
      } else {
        fromAddress = targetAddress;
      }
      
      // Create RWA20TxRecord with proper 'to' field
      const rwa20Tx: RWA20TxRecord = {
        ...record,
        status: record.status,
        amount: amountBigInt,
        to: toAddress,
        from: fromAddress,
        type: isMintOperation ? "MINT" : "BURN"
      };
      
      return rwa20Tx;
    } catch (error) {
      console.error('Error converting to RWA20TxRecord:', error);
      return null;
    }
  }

  // Add bigIntReplacer method
  private bigIntReplacer(value: any): any {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }
}
