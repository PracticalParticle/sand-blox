import { Address, PublicClient, WalletClient, Chain, Hex } from 'viem';
import { TransactionOptions, TransactionResult } from '../../../particle-core/sdk/typescript/interfaces/base.index';
import { TxRecord, MetaTransaction } from '../../../particle-core/sdk/typescript/interfaces/lib.index';
import { ContractValidations } from '../../../particle-core/sdk/typescript/utils/validations';
import SimpleRWA20 from '../SimpleRWA20';
import { TokenMetadata, TokenMetaTxParams, RWA20TxRecord } from './types';
import SecureOwnable from '../../../particle-core/sdk/typescript/SecureOwnable';

// Storage key for meta tx settings
const META_TX_SETTINGS_KEY = 'simpleRWA20.metaTxSettings';

// Default values for meta tx settings
const DEFAULT_META_TX_SETTINGS: TokenMetaTxParams = {
  deadline: BigInt(3600), // 1 hour in seconds
  maxGasPrice: BigInt(50000000000) // 50 gwei
};

/**
 * Services class providing business logic for SimpleRWA20 operations
 */
export class SimpleRWA20Service {
  private client: PublicClient;
  private walletClient?: WalletClient;
  private contractAddress: Address;
  private chain: Chain;
  private rwa20: SimpleRWA20;
  private validations: ContractValidations;
  private secureOwnable: SecureOwnable;

  constructor(
    client: PublicClient,
    walletClient: WalletClient | undefined,
    contractAddress: Address,
    chain: Chain
  ) {
    this.client = client;
    this.walletClient = walletClient;
    this.contractAddress = contractAddress;
    this.chain = chain;
    this.rwa20 = new SimpleRWA20(this.client, walletClient, this.contractAddress, this.chain);
    this.validations = new ContractValidations(this.client);
    this.secureOwnable = new SecureOwnable(this.client, walletClient, this.contractAddress, this.chain);
  }

  /**
   * Get meta transaction settings from local storage
   * @returns TokenMetaTxParams with stored or default settings
   */
  getStoredMetaTxSettings(): TokenMetaTxParams {
    try {
      const stored = localStorage.getItem(META_TX_SETTINGS_KEY);
      if (!stored) return DEFAULT_META_TX_SETTINGS;
      const parsed = JSON.parse(stored);
      return {
        deadline: BigInt(parsed.deadline),
        maxGasPrice: BigInt(parsed.maxGasPrice)
      };
    } catch (error) {
      console.error('Failed to load meta tx settings:', error);
      return DEFAULT_META_TX_SETTINGS;
    }
  }

  /**
   * Create TokenMetaTxParams with absolute deadline from settings
   * @param settings TokenMetaTxParams containing relative deadline
   * @returns TokenMetaTxParams with absolute deadline
   */
  createMetaTxParams(settings: TokenMetaTxParams): TokenMetaTxParams {
    // Get current timestamp in seconds
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    
    // Convert deadline from seconds to actual timestamp by adding to current time
    const deadlineTimestamp = currentTimestamp + BigInt(settings.deadline);
    
    return {
      deadline: deadlineTimestamp,
      maxGasPrice: settings.maxGasPrice
    };
  }

  /**
   * Store meta transaction settings to local storage
   * @param settings TokenMetaTxParams to store
   */
  storeMetaTxSettings(settings: TokenMetaTxParams): void {
    try {
      localStorage.setItem(META_TX_SETTINGS_KEY, JSON.stringify({
        deadline: settings.deadline.toString(),
        maxGasPrice: settings.maxGasPrice.toString()
      }));
    } catch (error) {
      console.error('Failed to store meta tx settings:', error);
    }
  }

  /**
   * Gets the token metadata
   */
  async getTokenMetadata(): Promise<TokenMetadata> {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      this.rwa20.name(),
      this.rwa20.symbol(),
      this.rwa20.decimals(),
      this.rwa20.totalSupply()
    ]);

    return { name, symbol, decimals, totalSupply };
  }

  /**
   * Get balance of an address
   */
  async getBalance(address: Address): Promise<bigint> {
    return this.rwa20.balanceOf(address);
  }

  /**
   * Transfer tokens with validation
   */
  async transfer(
    to: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const senderBalance = await this.rwa20.balanceOf(options.from);
    if (amount > senderBalance) {
      throw new Error("Insufficient token balance");
    }

    return this.rwa20.transfer(to, amount, options);
  }

  /**
   * Approve tokens with validation
   */
  async approve(
    spender: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    return this.rwa20.approve(spender, amount, options);
  }

  /**
   * Mint tokens with meta-transaction and validation
   */
  async mintWithMetaTx(
    metaTx: MetaTransaction,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const broadcaster = await this.secureOwnable.getBroadcaster();
    await this.validations.validateBroadcaster(options.from.toLowerCase() as Address, broadcaster.toLowerCase() as Address);
    await this.validations.validateMetaTransaction(metaTx);

    return this.rwa20.mintWithMetaTx(metaTx, options);
  }

  /**
   * Burn tokens with meta-transaction and validation
   */
  async burnWithMetaTx(
    metaTx: MetaTransaction,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const broadcaster = await this.secureOwnable.getBroadcaster();
    await this.validations.validateBroadcaster(options.from.toLowerCase() as Address, broadcaster.toLowerCase() as Address);
    await this.validations.validateMetaTransaction(metaTx);

    return this.rwa20.burnWithMetaTx(metaTx, options);
  }

  /**
   * Generate signed mint meta-transaction
   */
  async generateSignedMintMetaTx(
    to: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<string> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.secureOwnable.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    // Get stored settings and create meta tx params
    const storedSettings = this.getStoredMetaTxSettings();
    const metaTxParams = this.createMetaTxParams(storedSettings);
    
    // Generate unsigned meta transaction
    const unsignedMetaTx = await this.rwa20.generateUnsignedMintMetaTx(
      to,
      amount,
      metaTxParams
    );
    
    // Get the message hash and sign it
    const messageHash = unsignedMetaTx.message;
    const signature = await this.walletClient.signMessage({
      message: { raw: messageHash as Hex },
      account: options.from
    });
    
    // Create the complete signed meta transaction
    const signedMetaTx = {
      ...unsignedMetaTx,
      signature
    };
    
    // Convert BigInt values to strings recursively for JSON serialization
    const serializableMetaTx = JSON.parse(
      JSON.stringify(signedMetaTx, (_, value) => 
        typeof value === 'bigint' ? value.toString() : value
      )
    );
    
    return JSON.stringify(serializableMetaTx);
  }

  /**
   * Generate signed burn meta-transaction
   */
  async generateSignedBurnMetaTx(
    from: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<string> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.secureOwnable.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    // Validate balance
    const accountBalance = await this.rwa20.balanceOf(from);
    if (amount > accountBalance) {
      throw new Error("Insufficient token balance");
    }

    // Get stored settings and create meta tx params
    const storedSettings = this.getStoredMetaTxSettings();
    const metaTxParams = this.createMetaTxParams(storedSettings);
    
    // Generate unsigned meta transaction
    const unsignedMetaTx = await this.rwa20.generateUnsignedBurnMetaTx(
      from,
      amount,
      metaTxParams
    );
    
    // Get the message hash and sign it
    const messageHash = unsignedMetaTx.message;
    const signature = await this.walletClient.signMessage({
      message: { raw: messageHash as Hex },
      account: options.from
    });
    
    // Create the complete signed meta transaction
    const signedMetaTx = {
      ...unsignedMetaTx,
      signature
    };
    
    // Convert BigInt values to strings recursively for JSON serialization
    const serializableMetaTx = JSON.parse(
      JSON.stringify(signedMetaTx, (_, value) => 
        typeof value === 'bigint' ? value.toString() : value
      )
    );
    
    return JSON.stringify(serializableMetaTx);
  }

  /**
   * Gets all transactions from the operation history
   */
  async getOperationHistory(): Promise<TxRecord[]> {
    try {
      console.log("Reading operation history from contract...");
      const result = await this.secureOwnable.getOperationHistory();
      
      console.log("Raw operation history result:", result);
      
      // Ensure we have a valid array result
      if (!Array.isArray(result)) {
        console.error("Operation history is not an array:", result);
        return [];
      }
      
      // Convert and validate each record
      const records = result.map((record: any) => {
        // Ensure each record has the required fields
        if (!record || typeof record !== 'object') {
          console.warn("Invalid record in operation history:", record);
          return null;
        }
        
        try {
          // Ensure txId is a bigint
          const txId = typeof record.txId === 'bigint' ? record.txId : BigInt(record.txId || 0);
          
          return {
            ...record,
            txId,
            // Ensure other bigint fields are properly converted
            releaseTime: typeof record.releaseTime === 'bigint' ? record.releaseTime : BigInt(record.releaseTime || 0),
            value: typeof record.value === 'bigint' ? record.value : BigInt(record.value || 0),
            gasLimit: typeof record.gasLimit === 'bigint' ? record.gasLimit : BigInt(record.gasLimit || 0)
          } as TxRecord;
        } catch (error) {
          console.error("Error processing record:", error, record);
          return null;
        }
      }).filter((record): record is TxRecord => record !== null);
      
      return records;
    } catch (error) {
      console.error("Error fetching operation history:", error);
      return [];
    }
  }

  /**
   * Gets a specific transaction's details
   */
  async getTransaction(txId: number): Promise<RWA20TxRecord> {
    try {
      const tx = await this.secureOwnable.getOperation(BigInt(txId));
      if (!tx) throw new Error("Transaction not found");

      // Map the status directly from the transaction
      const status = tx.status;
      
      // Extract data from tx.params based on operation type
      let to: Address = '0x0000000000000000000000000000000000000000';
      let from: Address | undefined = undefined;
      let amount: bigint = BigInt(0);
      let type: "MINT" | "BURN" = "MINT";
      
      // Validate operation type exists
      const operationType = tx.params.operationType as Hex;
      const operationTypes = await this.getRWA20OperationTypes();
      
      if (!operationTypes.has(operationType)) {
        throw new Error(`Unsupported operation type: ${operationType}`);
      }

      // Decode parameters based on operation type name
      const operationName = operationTypes.get(operationType);
      if (operationName === 'MINT_TOKENS') {
        type = "MINT";
        // For mint operations, the target is the recipient
        to = tx.params.target as Address;
        amount = tx.params.value;
      } else if (operationName === 'BURN_TOKENS') {
        type = "BURN";
        // For burn operations, the target is the address to burn from
        from = tx.params.target as Address;
        amount = tx.params.value;
        to = '0x0000000000000000000000000000000000000000'; // Zero address for burn
      }
      
      // Create a RWA20TxRecord with the decoded information
      const rwa20Tx: RWA20TxRecord = {
        ...tx,
        status,
        amount,
        to,
        from,
        type
      };
      
      return rwa20Tx;
    } catch (error) {
      console.error(`Error in getTransaction for txId ${txId}:`, error);
      throw new Error(`Failed to get transaction details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets all token operations (mint/burn) from history
   */
  async getTokenOperations(): Promise<RWA20TxRecord[]> {
    try {
      console.log("Fetching operation history...");
      const operations = await this.getOperationHistory();
      console.log("All operations count:", operations?.length || 0);
      
      // Ensure operations is an array before filtering
      if (!Array.isArray(operations)) {
        console.warn("Operations is not an array:", operations);
        return [];
      }
      
      // Convert each operation to RWA20TxRecord
      const tokenTxs: RWA20TxRecord[] = [];
      
      for (const op of operations) {
        try {
          // Ensure txId is a valid number
          if (op.txId === undefined || op.txId === null) {
            console.warn("Operation missing txId:", op);
            continue;
          }
          
          const txId = Number(op.txId);
          if (isNaN(txId)) {
            console.warn(`Invalid txId: ${op.txId}`);
            continue;
          }
          
          console.log(`Processing transaction with ID: ${txId}`);
          
          // Get transaction details with a timeout to prevent hanging
          const txPromise = this.getTransaction(txId);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Transaction ${txId} fetch timed out`)), 10000);
          });
          
          const tx = await Promise.race([txPromise, timeoutPromise]) as RWA20TxRecord;
          tokenTxs.push(tx);
        } catch (error) {
          console.error("Error processing transaction:", error);
          // Continue with next transaction instead of failing the entire batch
        }
      }
      
      console.log("Final token transactions count:", tokenTxs.length);
      return tokenTxs;
    } catch (error) {
      console.error("Error in getTokenOperations:", error);
      // Return empty array instead of failing
      return [];
    }
  }

  /**
   * Gets a mapping of operation type hashes to names
   */
  async getRWA20OperationTypes(): Promise<Map<Hex, string>> {
    const operations = await this.secureOwnable.getSupportedOperationTypes();
    return new Map(operations.map(op => [op.operationType as Hex, op.name]));
  }

  /**
   * Check allowance for a spender
   */
  async getAllowance(owner: Address, spender: Address): Promise<bigint> {
    return this.rwa20.allowance(owner, spender);
  }
}
