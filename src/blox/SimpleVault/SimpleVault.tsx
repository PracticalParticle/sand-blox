import { 
  Address, 
  PublicClient, 
  WalletClient,
  Chain,
  Abi,
  decodeAbiParameters,
  parseAbiParameters
} from 'viem';
import SimpleVaultABIJson from './SimpleVault.abi.json';
import SecureOwnable from '../../particle-core/sdk/typescript/SecureOwnable';
import { TxRecord, MetaTransaction } from '../../particle-core/sdk/typescript/interfaces/lib.index';
import { TransactionOptions, TransactionResult } from '../../particle-core/sdk/typescript/interfaces/base.index';
import { TxStatus } from '../../particle-core/sdk/typescript/types/lib.index';
import { ContractValidations } from '../../particle-core/sdk/typescript/utils/validations';

// Parse and type the ABI
const SimpleVaultABI = SimpleVaultABIJson as Abi;

/**
 * Transaction record with extended information
 */
export interface VaultTxRecord extends Omit<TxRecord, 'status'> {
  status: TxStatus;
  amount: bigint;
  to: Address;
  token?: Address;
  type: "ETH" | "TOKEN";
}

/**
 * @title SimpleVault
 * @notice TypeScript interface for SimpleVault smart contract
 * @dev Extends SecureOwnable to provide secure vault functionality for ETH and ERC20 tokens
 */
export default class SimpleVault extends SecureOwnable {
  protected publicClient: PublicClient;
  protected walletClient: WalletClient | undefined;
  protected address: Address;
  protected chain: Chain;
  protected validations: ContractValidations;
  // Constants for operation types
  static readonly WITHDRAW_ETH = "WITHDRAW_ETH";
  static readonly WITHDRAW_TOKEN = "WITHDRAW_TOKEN";

  /**
   * @notice Creates a new SimpleVault instance
   * @param client The viem PublicClient instance for blockchain interactions
   * @param walletClient Optional WalletClient for signing transactions
   * @param contractAddress The address of the contract
   * @param chain The chain object for the network
   */
  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient | undefined,
    address: Address,
    chain: Chain
  ) {
    super(publicClient, walletClient, address, chain);
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
    this.chain = chain;
    this.validations = new ContractValidations(publicClient);
  }

  async getEthBalance(): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SimpleVaultABI,
      functionName: 'getEthBalance'
    }) as unknown;
    
    // Ensure we return a bigint, defaulting to 0n if the result is falsy
    return result ? BigInt(result.toString()) : 0n;
  }

  /**
   * @notice Gets the token balance of the vault
   * @param token The token contract address
   * @return The token balance
   */
  async getTokenBalance(token: Address): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SimpleVaultABI,
      functionName: 'getTokenBalance',
      args: [token]
    }) as bigint;
    return result;
  }

  /**
   * @notice Request ETH withdrawal from the vault
   * @param to Recipient address
   * @param amount Amount of ETH to withdraw in wei
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async withdrawEthRequest(
    to: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const currentBalance = await this.getEthBalance();
    if (amount > currentBalance) {
      throw new Error("Insufficient vault balance");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.address,
      abi: SimpleVaultABI,
      functionName: 'withdrawEthRequest',
      args: [to, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Request token withdrawal from the vault
   * @param token Token contract address
   * @param to Recipient address
   * @param amount Amount of tokens to withdraw
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async withdrawTokenRequest(
    token: Address,
    to: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const currentBalance = await this.getTokenBalance(token);
    if (amount > currentBalance) {
      throw new Error("Insufficient token balance");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.address,
      abi: SimpleVaultABI,
      functionName: 'withdrawTokenRequest',
      args: [token, to, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Approve a withdrawal after the time delay has passed
   * @param txId The ID of the withdrawal transaction to approve
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async approveWithdrawalAfterDelay(
    txId: number,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const operation = await this.getOperation(txId);
    if (operation.status !== SecureOwnable.TxStatus.PENDING) {
      throw new Error("Can only approve pending requests");
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp < operation.releaseTime) {
      throw new Error("Current time is before release time");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.address,
      abi: SimpleVaultABI,
      functionName: 'approveWithdrawalAfterDelay',
      args: [txId],
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Cancel a pending withdrawal request
   * @param txId The ID of the withdrawal transaction to cancel
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async cancelWithdrawal(
    txId: number,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const operation = await this.getOperation(txId);
    if (operation.status !== SecureOwnable.TxStatus.PENDING) {
      throw new Error("Can only cancel pending requests");
    }

    const timeLockPeriod = await this.getTimeLockPeriodInDays();
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    if (currentTimestamp < operation.releaseTime - (BigInt(timeLockPeriod) * 24n * 60n * 60n) + 3600n) {
      throw new Error("Cannot cancel within first hour");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.address,
      abi: SimpleVaultABI,
      functionName: 'cancelWithdrawal',
      args: [txId],
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Approve withdrawal with meta transaction
   * @param metaTx The meta-transaction data
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async approveWithdrawalWithMetaTx(
    metaTx: MetaTransaction,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const broadcaster = await this.getBroadcaster();
    await this.validations.validateBroadcaster(options.from, broadcaster);
    await this.validations.validateMetaTransaction(metaTx);

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.address,
      abi: SimpleVaultABI,
      functionName: 'approveWithdrawalWithMetaTx',
      args: [metaTx],
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Gets a specific transaction's details
   * @param txId Transaction ID
   * @return Transaction record with status
   */
  async getTransaction(txId: number): Promise<VaultTxRecord> {
    try {
      const tx = await this.getOperation(txId);
      if (!tx) throw new Error("Transaction not found");

      // Map the status directly from the transaction
      let status = tx.status;
      
      // Default values in case decoding fails
      let to: Address = '0x0000000000000000000000000000000000000000';
      let amount: bigint = BigInt(0);
      let token: Address | undefined = undefined;
      let type: "ETH" | "TOKEN" = "ETH";
      
      try {
        // Decode the transaction parameters from the execution options
        if (tx.executionOptions && tx.executionOptions !== '0x') {
          const executionOptionsResult = decodeAbiParameters(
            parseAbiParameters('bytes4, bytes'),
            tx.executionOptions as `0x${string}`
          );
          
          if (executionOptionsResult && executionOptionsResult.length > 1) {
            const executionOptions = executionOptionsResult[1];
            
            if (executionOptions && executionOptions !== '0x') {
              const decodedParams = decodeAbiParameters(
                parseAbiParameters('address, uint256'),
                executionOptions as `0x${string}`
              ) as [Address, bigint];
              
              if (decodedParams && decodedParams.length >= 2) {
                [to, amount] = decodedParams;
              }
              
              // Determine transaction type and token address if applicable
              type = tx.operationType === SimpleVault.WITHDRAW_ETH ? "ETH" : "TOKEN";
              
              if (tx.operationType === SimpleVault.WITHDRAW_TOKEN) {
                try {
                  token = decodeAbiParameters(
                    parseAbiParameters('address'),
                    executionOptions as `0x${string}`
                  )[0] as Address;
                } catch (tokenError) {
                  console.error("Error decoding token address:", tokenError);
                }
              }
            }
          }
        }
      } catch (decodeError) {
        console.error("Error decoding transaction data:", decodeError);
        // Continue with default values
      }

      return {
        ...tx,
        status,
        amount,
        to,
        type,
        token
      };
    } catch (error) {
      console.error(`Error in getTransaction for txId ${txId}:`, error);
      throw new Error(`Failed to get transaction details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getOperationHistory(): Promise<TxRecord[]> {
    try {
      console.log("Reading operation history from contract...");
      const result = await this.publicClient.readContract({
        address: this.address,
        abi: SimpleVaultABI,
        functionName: 'getOperationHistory'
      });
      
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
   * @notice Gets all pending transactions for the vault
   * @return Array of transaction records with status
   */
  async getPendingTransactions(): Promise<VaultTxRecord[]> {
    try {
      console.log("Fetching operation history...");
      const operations = await this.getOperationHistory();
      console.log("All operations:", operations);
      
      const pendingOps = operations.filter(op => op.status === SecureOwnable.TxStatus.PENDING);
      console.log("Filtered pending operations:", pendingOps);
      
      // Convert each pending operation to VaultTxRecord
      const pendingTxs: VaultTxRecord[] = [];
      
      for (const op of pendingOps) {
        try {
          const txId = Number(op.txId);
          console.log(`Processing pending transaction with ID: ${txId}`);
          const tx = await this.getTransaction(txId);
          pendingTxs.push(tx);
        } catch (error) {
          console.error("Error processing pending transaction:", error);
          // Continue with next transaction instead of failing the entire batch
        }
      }
      
      console.log("Final pending transactions:", pendingTxs);
      return pendingTxs;
    } catch (error) {
      console.error("Error in getPendingTransactions:", error);
      // Return empty array instead of failing
      return [];
    }
  }

  /**
   * @notice Gets the token metadata
   * @param token The token contract address
   * @return The token metadata including name, symbol, and decimals
   */
  async getTokenMetadata(token: Address): Promise<{
    name: string;
    symbol: string;
    decimals: number;
  }> {
    const [name, symbol, decimals] = await Promise.all([
      this.publicClient.readContract({
        address: token,
        abi: [
          { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
        ],
        functionName: 'name'
      }) as Promise<string>,
      this.publicClient.readContract({
        address: token,
        abi: [
          { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
        ],
        functionName: 'symbol'
      }) as Promise<string>,
      this.publicClient.readContract({
        address: token,
        abi: [
          { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
        ],
        functionName: 'decimals'
      }) as Promise<number>
    ]);

    return { name, symbol, decimals };
  }

  /**
   * @notice Check token allowance for the vault
   * @param token Token contract address
   * @param owner Address to check allowance for
   * @return Current allowance amount
   */
  async getTokenAllowance(token: Address, owner: Address): Promise<bigint> {
    const allowance = await this.publicClient.readContract({
      address: token,
      abi: [
        {
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
          ],
          name: 'allowance',
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
          type: 'function'
        }
      ],
      functionName: 'allowance',
      args: [owner, this.address]
    }) as bigint;

    return allowance;
  }

  /**
   * @notice Approve vault to spend tokens
   * @param token Token contract address
   * @param amount Amount to approve
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async approveTokenAllowance(
    token: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    // First check current allowance to avoid unnecessary approvals
    const currentAllowance = await this.getTokenAllowance(token, options.from);
    if (currentAllowance >= amount) {
      throw new Error("Allowance already sufficient");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: token,
      abi: [
        {
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          name: 'approve',
          outputs: [{ type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function'
        }
      ],
      functionName: 'approve',
      args: [this.address, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Revoke vault's permission to spend tokens
   * @param token Token contract address
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async revokeTokenAllowance(
    token: Address,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    // Check current allowance to avoid unnecessary transactions
    const currentAllowance = await this.getTokenAllowance(token, options.from);
    if (currentAllowance === BigInt(0)) {
      throw new Error("Allowance already revoked");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: token,
      abi: [
        {
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          name: 'approve',
          outputs: [{ type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function'
        }
      ],
      functionName: 'approve',
      args: [this.address, BigInt(0)],
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Deposit ETH into the vault using direct wallet transfer
   * @param amount Amount of ETH to deposit in wei
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async depositEth(
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    // Send ETH directly to the vault contract
    const hash = await this.walletClient.sendTransaction({
      chain: this.chain,
      to: this.address,
      value: amount,
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Deposit ERC20 tokens into the vault using safeTransfer
   * @param token Token contract address
   * @param amount Amount of tokens to deposit
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async depositToken(
    token: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    // Use safeTransfer to send tokens directly to the vault
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: token,
      abi: [
        {
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          name: 'transfer',
          outputs: [{ type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function'
        }
      ],
      functionName: 'transfer',
      args: [this.address, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.publicClient.waitForTransactionReceipt({ hash })
    };
  }
}
