import { Address, Chain, Hex, PublicClient, WalletClient, keccak256, toHex } from 'viem';
import { TransactionOptions } from '../../../particle-core/sdk/typescript/interfaces/base.index';
import { BaseBloxOperationsHandler } from '../../../types/BloxOperationsHandler';
import { MetaTransaction, TxRecord } from '../../../particle-core/sdk/typescript/interfaces/lib.index';
import { MultiPhaseOperationFunctions } from '../../../types/OperationRegistry';
import SimpleVault from '../SimpleVault';
import { TxStatus } from '../../../particle-core/sdk/typescript/types/lib.index';
import { SecureOwnable } from '../../../particle-core/sdk/typescript/SecureOwnable';
import { VaultMetaTxParams } from '../SimpleVault';
import { prepareAndSignMetaTransaction } from '../../../lib/MetaTxUtils';

/**
 * Represents a transaction record with vault-specific details
 */
export interface VaultTxRecord extends Omit<TxRecord, 'status'> {
  status: TxStatus;
  amount: bigint;
  to: Address;
  token?: Address;
  type: "ETH" | "TOKEN";
}

// Storage key for meta tx settings
const META_TX_SETTINGS_KEY = 'simpleVault.metaTxSettings';

// Default values for meta tx settings
const DEFAULT_META_TX_SETTINGS: VaultMetaTxParams = {
  deadline: BigInt(3600), // 1 hour in seconds
  maxGasPrice: BigInt(50000000000) // 50 gwei
};

/**
 * Get meta transaction settings from local storage
 * @returns VaultMetaTxParams with stored or default settings
 */
export const getStoredMetaTxSettings = (): VaultMetaTxParams => {
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
};

/**
 * Create VaultMetaTxParams with absolute deadline from settings
 * @param settings VaultMetaTxParams containing relative deadline
 * @returns VaultMetaTxParams with absolute deadline
 */
export const createVaultMetaTxParams = (settings: VaultMetaTxParams): VaultMetaTxParams => {
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
  return (toHex(keccak256(new TextEncoder().encode(signature))).slice(0, 10)) as Hex;
};

/**
 * Operation handler for SimpleVault Blox
 */
export default class SimpleVaultOperationsHandler extends BaseBloxOperationsHandler {
  // Operation type constants - use human-readable names
  static readonly WITHDRAW_ETH = "WITHDRAW_ETH";
  static readonly WITHDRAW_TOKEN = "WITHDRAW_TOKEN";
  
  // Function selectors for operations - computed explicitly
  static readonly FUNCTION_SELECTORS = {
    WITHDRAW_ETH: computeFunctionSelector("withdrawEthRequest(address,uint256)"),
    WITHDRAW_TOKEN: computeFunctionSelector("withdrawTokenRequest(address,address,uint256)"),
    APPROVE_WITHDRAWAL: computeFunctionSelector("approveWithdrawalAfterDelay(uint256)"),
    CANCEL_WITHDRAWAL: computeFunctionSelector("cancelWithdrawal(uint256)"),
    APPROVE_WITHDRAWAL_META_TX: computeFunctionSelector("approveWithdrawalWithMetaTx((uint256,uint256,uint8,(address,address,uint256,uint256,bytes32,uint8,bytes),bytes32,bytes,(address,uint256,address,uint256),(uint256,uint256,address,bytes4,uint256,uint256,address),bytes,bytes))")
  } as const;

  // Map to store operation type hashes by name
  private operationTypeMap: Map<string, Hex> = new Map();

  constructor() {
    super("simple-vault", ["SimpleVault"]);
  }

  /**
   * Register all operations for SimpleVault
   */
  async registerOperations(
    contract: SimpleVault,
    contractAddress: Address,
    publicClient: PublicClient,
    walletClient?: WalletClient,
    chain?: Chain,
    storeTransaction?: (txId: string, signedData: string, metadata?: Record<string, any>) => void
  ): Promise<void> {
    // Initialize the handler
    this.initialize(contract, contractAddress, publicClient, walletClient, chain);
    this.storeTransaction = storeTransaction;
    
    // Load operation types
    await this.loadOperationTypes();
    
    // Register operations
    this.registerWithdrawEthOperation(contract);
    this.registerWithdrawTokenOperation(contract);
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
        SimpleVaultOperationsHandler.WITHDRAW_ETH,
        SimpleVaultOperationsHandler.WITHDRAW_TOKEN
      ];
      
      const missingTypes = requiredTypes.filter(type => !this.operationTypeMap.has(type));
      if (missingTypes.length > 0) {
        console.warn(`Some required operation types are missing from contract: ${missingTypes.join(', ')}`);
        
        // Attempt to find close matches by name similarity
        types.forEach(({ operationType, name }) => {
          for (const missingType of missingTypes) {
            // Check if the contract-provided name contains parts of our expected names
            // e.g., "Withdraw ETH" would match with "WITHDRAW_ETH"
            if (name.toUpperCase().includes(missingType.replace(/_/g, ' ')) || 
                missingType.includes(name.toUpperCase().replace(/\s/g, '_'))) {
              console.log(`Using "${name}" (${operationType}) for "${missingType}"`);
              this.operationTypeMap.set(missingType, operationType as Hex);
            }
          }
        });
      }
      
      console.log(`Loaded ${this.operationTypeMap.size} operation types for SimpleVault`);
    } catch (error) {
      console.error('Failed to load operation types for SimpleVault:', error);
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
   * Register the WITHDRAW_ETH operation
   */
  private registerWithdrawEthOperation(contract: SimpleVault): void {
    // Define the functions for the withdraw ETH operation
    const functions: MultiPhaseOperationFunctions = {
      // Request phase
      request: async (params: { to: Address, amount: bigint }, options: TransactionOptions) => {
        return contract.withdrawEthRequest(params.to, params.amount, options);
      },
      
      // Approval phase
      approve: async (txId: bigint, options: TransactionOptions) => {
        return contract.approveWithdrawalAfterDelay(txId, options);
      },
      
      approveWithMetaTx: async (metaTx: MetaTransaction, options: TransactionOptions) => {
        return contract.approveWithdrawalWithMetaTx(metaTx, options);
      },
      
      // Cancellation phase
      cancel: async (txId: bigint, options: TransactionOptions) => {
        return contract.cancelWithdrawal(txId, options);
      },
      
      cancelWithMetaTx: async (metaTx: MetaTransaction, options: TransactionOptions) => {
        // Implement this if available in the SimpleVault contract
        throw new Error(`Cancel with meta-transaction not implemented for transaction ${JSON.stringify(metaTx)} with options ${JSON.stringify(options)}`);
      },
      
      // Meta-transaction preparation helpers
      prepareMetaTxApprove: async (txId: bigint, options: TransactionOptions) => {
        if (!this.walletClient || !options.from) {
          throw new Error("Wallet client and sender address required");
        }
        
        if (!this.contractAddress) {
          throw new Error("Contract address is required");
        }
        
        const metaTxParams = {
          deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
          maxGasPrice: BigInt(0) // No max gas price
        };
        
        const unsignedMetaTx = await contract.generateUnsignedWithdrawalMetaTxApproval(
          txId,
          metaTxParams
        );
        
        // Use centralized utility to sign the meta transaction with correct operation type
        return await prepareAndSignMetaTransaction(
          this.walletClient,
          unsignedMetaTx,
          this.contractAddress as Address,
          options,
          {
            type: SimpleVaultOperationsHandler.WITHDRAW_ETH, // Use the correct operation type for ETH
            action: 'approve'
          }
        );
      },
      
      prepareMetaTxCancel: async (txId: bigint, options: TransactionOptions) => {
        // Implement this if available in the SimpleVault contract
        throw new Error(`Prepare meta-transaction cancel not implemented for transaction ID ${txId} with options ${JSON.stringify(options)}`);
      }
    };
    
    try {
      // Get operation hash from name
      const operationTypeHash = this.getOperationTypeHash(SimpleVaultOperationsHandler.WITHDRAW_ETH);
      
      // Register the operation
      this.registerMultiPhaseOperation(
        SimpleVaultOperationsHandler.WITHDRAW_ETH,
        operationTypeHash,
        "WITHDRAW_ETH",
        "Withdraw ETH from the vault to a specified address",
        SimpleVaultOperationsHandler.FUNCTION_SELECTORS.WITHDRAW_ETH,
        functions,
        {
          request: 'owner',
          approve: 'owner',
          cancel: 'owner',
          metaApprove: 'owner',
          metaCancel: 'owner'
        }
      );
    } catch (error) {
      console.error(`Failed to register WITHDRAW_ETH operation: ${error}`);
    }
  }

  /**
   * Register the WITHDRAW_TOKEN operation
   */
  private registerWithdrawTokenOperation(contract: SimpleVault): void {
    // Define the functions for the withdraw token operation
    const functions: MultiPhaseOperationFunctions = {
      // Request phase
      request: async (params: { token: Address, to: Address, amount: bigint }, options: TransactionOptions) => {
        return contract.withdrawTokenRequest(params.token, params.to, params.amount, options);
      },
      
      // Approval phase
      approve: async (txId: bigint, options: TransactionOptions) => {
        return contract.approveWithdrawalAfterDelay(txId, options);
      },
      
      approveWithMetaTx: async (metaTx: MetaTransaction, options: TransactionOptions) => {
        return contract.approveWithdrawalWithMetaTx(metaTx, options);
      },
      
      // Cancellation phase
      cancel: async (txId: bigint, options: TransactionOptions) => {
        return contract.cancelWithdrawal(txId, options);
      },
      
      cancelWithMetaTx: async (metaTx: MetaTransaction, options: TransactionOptions) => {
        // Implement this if available in the SimpleVault contract
        throw new Error(`Cancel with meta-transaction not implemented for transaction ${JSON.stringify(metaTx)} with options ${JSON.stringify(options)}`);
      },
      
      // Meta-transaction preparation helpers
      prepareMetaTxApprove: async (txId: bigint, options: TransactionOptions) => {
        if (!this.walletClient || !options.from) {
          throw new Error("Wallet client and sender address required");
        }
        
        if (!this.contractAddress) {
          throw new Error("Contract address is required");
        }
        
        const metaTxParams = {
          deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
          maxGasPrice: BigInt(0) // No max gas price
        };
        
        const unsignedMetaTx = await contract.generateUnsignedWithdrawalMetaTxApproval(
          txId,
          metaTxParams
        );
        
        // Use centralized utility to sign the meta transaction with correct operation type
        return await prepareAndSignMetaTransaction(
          this.walletClient,
          unsignedMetaTx,
          this.contractAddress as Address,
          options,
          {
            type: SimpleVaultOperationsHandler.WITHDRAW_TOKEN, // Use the correct operation type for tokens
            action: 'approve'
          }
        );
      },
      
      prepareMetaTxCancel: async (txId: bigint, options: TransactionOptions) => {
        // Implement this if available in the SimpleVault contract
        throw new Error(`Prepare meta-transaction cancel not implemented for transaction ID ${txId} with options ${JSON.stringify(options)}`);
      }
    };
    
    try {
      // Get operation hash from name
      const operationTypeHash = this.getOperationTypeHash(SimpleVaultOperationsHandler.WITHDRAW_TOKEN);
      
      // Register the operation
      this.registerMultiPhaseOperation(
        SimpleVaultOperationsHandler.WITHDRAW_TOKEN,
        operationTypeHash,
        "WITHDRAW_TOKEN",
        "Withdraw ERC20 tokens from the vault to a specified address",
        SimpleVaultOperationsHandler.FUNCTION_SELECTORS.WITHDRAW_TOKEN,
        functions,
        {
          request: 'owner',
          approve: 'owner',
          cancel: 'owner',
          metaApprove: 'owner',
          metaCancel: 'owner'
        }
      );
    } catch (error) {
      console.error(`Failed to register WITHDRAW_TOKEN operation: ${error}`);
    }
  }

  /**
   * Handle approval of a transaction
   */
  async handleApprove(txId: number): Promise<void> {
    if (!this.contract || !this.contractAddress || !this.walletClient?.account) {
      throw new Error("Contract not initialized");
    }

    const tx = await this.contract.approveWithdrawalAfterDelay(txId, {
      from: this.walletClient.account.address
    });
    await tx.wait();
  }

  /**
   * Handle cancellation of a transaction
   */
  async handleCancel(txId: number): Promise<void> {
    if (!this.contract || !this.contractAddress || !this.walletClient?.account) {
      throw new Error("Contract not initialized");
    }

    const tx = await this.contract.cancelWithdrawal(txId, {
      from: this.walletClient.account.address
    });
    await tx.wait();
  }

  /**
   * Handle meta-transaction signing
   */
  async handleMetaTxSign(tx: TxRecord, type: 'approve' | 'cancel'): Promise<void> {
    if (!this.contract || !this.contractAddress || !this.walletClient?.account) {
      throw new Error("Contract not initialized");
    }

    if (type === 'approve') {
      // Get stored settings and create meta tx params
      const storedSettings = getStoredMetaTxSettings();
      const metaTxParams = createVaultMetaTxParams(storedSettings);
      
      // Generate unsigned meta transaction
      const unsignedMetaTx = await this.contract.generateUnsignedWithdrawalMetaTxApproval(
        BigInt(tx.txId),
        metaTxParams
      );
      
      // Determine the operation type
      const operationName = this.getOperationName(tx);
      
      // Validate that this is a valid withdrawal operation
      if (operationName !== SimpleVaultOperationsHandler.WITHDRAW_ETH && 
          operationName !== SimpleVaultOperationsHandler.WITHDRAW_TOKEN) {
        throw new Error(`Invalid operation type: ${operationName}`);
      }
      
      // Use the centralized utility to sign the meta transaction
      await prepareAndSignMetaTransaction(
        this.walletClient,
        unsignedMetaTx,
        this.contractAddress as Address,
        { from: this.walletClient.account.address },
        {
          type: operationName,
          action: type,
          operationType: tx.params.operationType,
          bloxId: this.bloxId
        },
        this.storeTransaction
      );
    } else {
      throw new Error("Meta-transaction cancellation not implemented");
    }
  }

  /**
   * Handle meta-transaction broadcasting
   */
  async handleBroadcast(tx: TxRecord, type: 'approve' | 'cancel'): Promise<void> {
    if (!this.contract || !this.contractAddress || !this.walletClient?.account) {
      throw new Error("Contract not initialized");
    }

    if (type === 'approve') {
      // Get the stored transaction data
      const txId = tx.txId.toString();
      
      // Get the stored transaction from localStorage
      const storedTxKey = `dapp_signed_transactions`;
      const storedData = localStorage.getItem(storedTxKey);
      
      if (!storedData) {
        throw new Error("No stored transactions found");
      }

      const parsedData = JSON.parse(storedData);
      const contractTransactions = parsedData[this.contractAddress];
      
      if (!contractTransactions || !contractTransactions[txId]) {
        throw new Error("No stored transaction found for this ID");
      }

      const storedTx = contractTransactions[txId];
      const signedMetaTx = JSON.parse(storedTx.signedData);

      // Broadcast the transaction
      const result = await this.contract.approveWithdrawalWithMetaTx(
        signedMetaTx,
        { from: this.walletClient.account.address }
      );
      
      await result.wait();
    } else {
      throw new Error("Meta-transaction cancellation not implemented");
    }
  }

  /**
   * Convert a TxRecord to a VaultTxRecord
   */
  convertRecord(record: TxRecord): VaultTxRecord | null {
    try {
      const operationName = this.getOperationName(record);
      
      // Only convert if this is a withdrawal operation
      if (operationName !== 'WITHDRAW_ETH' && operationName !== 'WITHDRAW_TOKEN') {
        return null;
      }
      
      // Extract needed parameters from the transaction record
      const isEthWithdrawal = operationName === 'WITHDRAW_ETH';
      
      // Type assertion for dynamic access to params
      const params = record.params as any;
      
      console.log('Full transaction params:', params);
      
      // The "to" address is stored in params.target
      if (!params.target) {
        console.error('Missing "target" address in transaction params:', params);
        throw new Error('Missing "target" address in transaction params');
      }
      
      // The amount is stored in params.value
      if (params.value === undefined) {
        console.error('Missing "value" in transaction params:', params);
        throw new Error('Missing "value" in transaction params');
      }
      
      // If it's a token withdrawal, validate token address
      // For token withdrawals, the token address may be a parameter or might be
      // the target itself depending on implementation
      const tokenAddress = params.token || (isEthWithdrawal ? undefined : params.target);
      if (!isEthWithdrawal && !tokenAddress) {
        console.error('Missing token address for token withdrawal:', params);
        throw new Error('Missing token address for token withdrawal');
      }

      // Convert address and amount to appropriate types
      const toAddress = params.target as `0x${string}`;
      const amountBigInt = BigInt(params.value);
      
      console.log('Converting withdrawal record:', {
        recordId: record.txId.toString(),
        releaseTime: record.releaseTime.toString(),
        to: toAddress,
        amount: amountBigInt.toString(),
        token: !isEthWithdrawal ? tokenAddress : undefined
      });
      
      // Create VaultTxRecord from TxRecord
      const vaultTx: VaultTxRecord = {
        ...record, // Keep all original fields including result and payment
        status: record.status,
        amount: amountBigInt,
        to: toAddress,
        type: isEthWithdrawal ? "ETH" : "TOKEN"
      };
      
      // Add token address if it's a token withdrawal
      if (!isEthWithdrawal && tokenAddress) {
        vaultTx.token = tokenAddress as `0x${string}`;
      }
      
      // Validate the created object
      const requiredFields = ['txId', 'status', 'amount', 'to', 'type', 'releaseTime'];
      const missingFields = requiredFields.filter(field => {
        if (field === 'txId' || field === 'amount') {
          return vaultTx[field as keyof typeof vaultTx] === undefined;
        }
        return !vaultTx[field as keyof typeof vaultTx];
      });
      
      if (missingFields.length > 0) {
        console.error(`Created VaultTxRecord missing required fields: ${missingFields.join(', ')}`, vaultTx);
        throw new Error(`Created VaultTxRecord missing required fields: ${missingFields.join(', ')}`);
      }
      
      console.log('Successfully converted to VaultTxRecord:', {
        id: vaultTx.txId.toString(),
        to: vaultTx.to,
        amount: vaultTx.amount.toString(),
        type: vaultTx.type,
        releaseTime: vaultTx.releaseTime.toString()
      });
      
      return vaultTx;
    } catch (error) {
      console.error('Error converting to VaultTxRecord:', error);
      return null;
    }
  }
} 