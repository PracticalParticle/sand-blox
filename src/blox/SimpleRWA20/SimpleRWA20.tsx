import { Address, PublicClient, WalletClient, Chain, Abi, Hex } from 'viem';
import SimpleRWA20ABIJson from './SimpleRWA20.abi.json';
import SecureOwnable from '../../particle-core/sdk/typescript/SecureOwnable';
import { TxRecord, MetaTransaction } from '../../particle-core/sdk/typescript/interfaces/lib.index';
import { TransactionOptions, TransactionResult } from '../../particle-core/sdk/typescript/interfaces/base.index';
import { ContractValidations } from '../../particle-core/sdk/typescript/utils/validations';

// Parse and type the ABI
const SimpleRWA20ABI = SimpleRWA20ABIJson as Abi;

/**
 * Parameters for meta-transaction generation
 */
export interface TokenMetaTxParams {
  deadline: bigint;
  maxGasPrice: bigint;
}

/**
 * Token transaction record with additional properties
 */
export interface TokenTxRecord extends TxRecord {
  to: Address;
  amount: bigint;
  type: "MINT" | "BURN";
}

/**
 * @title SimpleRWA20
 * @notice TypeScript interface for SimpleRWA20 smart contract
 * @dev Extends SecureOwnable to provide secure ERC20 token for real-world assets
 */
export default class SimpleRWA20 extends SecureOwnable {
  protected validations: ContractValidations;
  // Constants for operation types
  static readonly MINT_TOKENS = "MINT_TOKENS";
  static readonly BURN_TOKENS = "BURN_TOKENS";

  /**
   * @notice Creates a new SimpleRWA20 instance
   * @param client The viem PublicClient instance for blockchain interactions
   * @param walletClient Optional WalletClient for signing transactions
   * @param contractAddress The address of the contract
   * @param chain The chain object for the network
   */
  constructor(
    client: PublicClient,
    walletClient: WalletClient | undefined,
    contractAddress: Address,
    chain: Chain
  ) {
    super(client, walletClient, contractAddress, chain);
    this.validations = new ContractValidations(client);
  }

  /**
   * @notice Gets the token name
   * @return The name of the token
   */
  async getName(): Promise<string> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'name'
    }) as string;
    return result;
  }

  /**
   * @notice Gets the token symbol
   * @return The symbol of the token
   */
  async getSymbol(): Promise<string> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'symbol'
    }) as string;
    return result;
  }

  /**
   * @notice Gets the total supply of the token
   * @return The total supply
   */
  async getTotalSupply(): Promise<bigint> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'totalSupply'
    }) as bigint;
    return result;
  }

  /**
   * @notice Gets the token balance of an address
   * @param account The address to check
   * @return The token balance
   */
  async getBalance(account: Address): Promise<bigint> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'balanceOf',
      args: [account]
    }) as bigint;
    return result;
  }

  /**
   * @notice Gets the token decimals
   * @return The number of decimals
   */
  async getDecimals(): Promise<number> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'decimals'
    }) as number;
    return result;
  }

  /**
   * @notice Gets the token allowance
   * @param owner The owner address
   * @param spender The spender address
   * @return The token allowance
   */
  async getAllowance(owner: Address, spender: Address): Promise<bigint> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'allowance',
      args: [owner, spender]
    }) as bigint;
    return result;
  }

  /**
   * @notice Check if token transfers are paused
   * @return True if paused
   */
  async isPaused(): Promise<boolean> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'paused'
    }) as boolean;
    return result;
  }

  /**
   * @notice Approve tokens for spending by another address
   * @param spender The address to approve
   * @param amount The amount to approve
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async approve(
    spender: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'approve',
      args: [spender, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Transfer tokens to another address
   * @param to The recipient address
   * @param amount The amount to transfer
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async transfer(
    to: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const balance = await this.getBalance(options.from);
    if (amount > balance) {
      throw new Error("Insufficient token balance");
    }

    const isPaused = await this.isPaused();
    if (isPaused) {
      throw new Error("Token transfers are paused");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'transfer',
      args: [to, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Transfer tokens from one address to another
   * @param from The source address
   * @param to The recipient address
   * @param amount The amount to transfer
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async transferFrom(
    from: Address,
    to: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const balance = await this.getBalance(from);
    if (amount > balance) {
      throw new Error("Insufficient token balance");
    }

    const allowance = await this.getAllowance(from, options.from);
    if (amount > allowance) {
      throw new Error("Insufficient allowance");
    }

    const isPaused = await this.isPaused();
    if (isPaused) {
      throw new Error("Token transfers are paused");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'transferFrom',
      args: [from, to, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Pause token transfers
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async pause(options: TransactionOptions): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const isPaused = await this.isPaused();
    if (isPaused) {
      throw new Error("Token is already paused");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'pause',
      args: [],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Unpause token transfers
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async unpause(options: TransactionOptions): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const isPaused = await this.isPaused();
    if (!isPaused) {
      throw new Error("Token is not paused");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'unpause',
      args: [],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Mint tokens using meta-transaction
   * @param metaTx The meta-transaction data
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async mintWithMetaTx(
    metaTx: MetaTransaction,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const broadcaster = await this.getBroadcaster();
    await this.validations.validateBroadcaster(options.from.toLowerCase() as Address, broadcaster.toLowerCase() as Address);
    await this.validations.validateMetaTransaction(metaTx);

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'mintWithMetaTx',
      args: [metaTx],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Burn tokens using meta-transaction
   * @param metaTx The meta-transaction data
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async burnWithMetaTx(
    metaTx: MetaTransaction,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const broadcaster = await this.getBroadcaster();
    await this.validations.validateBroadcaster(options.from.toLowerCase() as Address, broadcaster.toLowerCase() as Address);
    await this.validations.validateMetaTransaction(metaTx);

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'burnWithMetaTx',
      args: [metaTx],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Generate unsigned meta-transaction for minting tokens
   * @param to Recipient address
   * @param amount Amount to mint
   * @param params Meta-transaction parameters
   * @return The unsigned meta-transaction
   */
  async generateUnsignedMintMetaTx(
    to: Address,
    amount: bigint,
    params: TokenMetaTxParams
  ): Promise<MetaTransaction> {
    if (amount <= BigInt(0)) {
      throw new Error("Amount must be greater than 0");
    }

    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'generateUnsignedMintMetaTx',
      args: [to, amount, {
        deadline: params.deadline,
        maxGasPrice: params.maxGasPrice
      }]
    }) as MetaTransaction;
  }

  /**
   * @notice Generate unsigned meta-transaction for burning tokens
   * @param from Address to burn from
   * @param amount Amount to burn
   * @param params Meta-transaction parameters
   * @return The unsigned meta-transaction
   */
  async generateUnsignedBurnMetaTx(
    from: Address,
    amount: bigint,
    params: TokenMetaTxParams
  ): Promise<MetaTransaction> {
    if (amount <= BigInt(0)) {
      throw new Error("Amount must be greater than 0");
    }

    const balance = await this.getBalance(from);
    if (amount > balance) {
      throw new Error("Insufficient balance for burn");
    }

    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'generateUnsignedBurnMetaTx',
      args: [from, amount, {
        deadline: params.deadline,
        maxGasPrice: params.maxGasPrice
      }]
    }) as MetaTransaction;
  }

  /**
   * @notice Gets a specific transaction's details
   * @param txId Transaction ID
   * @return Token transaction record with status
   */
  async getTransaction(txId: number): Promise<TokenTxRecord> {
    try {
      const tx = await this.getOperation(BigInt(txId));
      if (!tx) throw new Error("Transaction not found");

      // Map the status directly from the transaction
      const status = tx.status;
      
      // Determine transaction details based on operation type
      let to: Address = '0x0000000000000000000000000000000000000000';
      let amount: bigint = BigInt(0);
      let type: "MINT" | "BURN" = "MINT";
      
      // Validate operation type exists
      const operationType = tx.params.operationType as Hex;
      const operationTypes = await this.getTokenOperationTypes();
      
      if (!operationTypes.has(operationType)) {
        throw new Error(`Unsupported operation type: ${operationType}`);
      }

      // Decode parameters based on operation type name
      const operationName = operationTypes.get(operationType);
      if (operationName === 'MINT_TOKENS') {
        type = "MINT";
        // Decode execution options to extract 'to' and 'amount'
        const executionData = tx.params.executionOptions;
        if (executionData) {
          // This would require proper decoding of the execution options
          // For simplicity, we're assuming a structure based on the contract
          to = tx.params.target as Address;
          amount = tx.params.value;
        }
      } else if (operationName === 'BURN_TOKENS') {
        type = "BURN";
        // Decode execution options to extract 'from' and 'amount'
        const executionData = tx.params.executionOptions;
        if (executionData) {
          // This would require proper decoding of the execution options
          to = tx.params.target as Address;
          amount = tx.params.value;
        }
      }
      
      // Create a TokenTxRecord with the decoded information
      const tokenTx: TokenTxRecord = {
        ...tx,
        status,
        amount,
        to,
        type
      };
      
      return tokenTx;
    } catch (error) {
      console.error(`Error in getTransaction for txId ${txId}:`, error);
      throw new Error(`Failed to get transaction details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @notice Gets all transactions for the token
   * @return Array of token transaction records
   */
  async getTransactions(): Promise<TokenTxRecord[]> {
    try {
      console.log("Reading operation history from contract...");
      const operations = await this.getOperationHistory();
      console.log("All operations count:", operations?.length || 0);
      
      // Ensure operations is an array before processing
      if (!Array.isArray(operations)) {
        console.warn("Operations is not an array:", operations);
        return [];
      }
      
      // Convert each operation to TokenTxRecord
      const tokenTxs: TokenTxRecord[] = [];
      
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
          
          // Get transaction details with a timeout to prevent hanging
          const txPromise = this.getTransaction(txId);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Transaction ${txId} fetch timed out`)), 10000);
          });
          
          const tx = await Promise.race([txPromise, timeoutPromise]) as TokenTxRecord;
          tokenTxs.push(tx);
        } catch (error) {
          console.error("Error processing transaction:", error);
          // Continue with next transaction instead of failing the entire batch
        }
      }
      
      console.log("Final transactions count:", tokenTxs.length);
      return tokenTxs;
    } catch (error) {
      console.error("Error in getTransactions:", error);
      // Return empty array instead of failing
      return [];
    }
  }

  /**
   * @notice Get token operation types from the contract
   * @return Map of operation type hash to name
   */
  async getTokenOperationTypes(): Promise<Map<Hex, string>> {
    const operations = await this.getSupportedOperationTypes();
    return new Map(operations.map(op => [op.operationType, op.name]));
  }
}
