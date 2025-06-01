import { Address, Chain, Hash, Hex, PublicClient, WalletClient } from 'viem';
import { MetaTransaction } from '../particle-core/sdk/typescript/interfaces/lib.index';
import { TransactionOptions } from '../particle-core/sdk/typescript/interfaces/base.index';
import { SecureOwnable } from '../particle-core/sdk/typescript/SecureOwnable';
import { registerCoreOperations } from '../registrations/CoreOperations';
import { registerBloxOperations, hasOperationsForContractType } from '../registrations/BloxOperations';
import { ExecutionType } from '../particle-core/sdk/typescript/types/lib.index';
import { 
  operationRegistry, 
  CoreOperationType,
  OperationType,
  OperationPhase,
  isMultiPhaseOperation,
  isSinglePhaseOperation,
  ContractRoleInfo,
  canExecuteOperationPhase
} from '../types/OperationRegistry';
import { SecureContractInfo } from './types';
import { OPERATION_TYPES, FUNCTION_SELECTORS } from '../particle-core/sdk/typescript/types/core.access.index';
import { prepareAndSignMetaTransaction, bigIntReplacer } from './MetaTxUtils';

/**
 * Maps human-readable operation types to contract-level hashes
 */
const OPERATION_TYPE_HASH_MAP: Record<CoreOperationType, Hex> = {
  [CoreOperationType.OWNERSHIP_TRANSFER]: OPERATION_TYPES.OWNERSHIP_TRANSFER as Hex,
  [CoreOperationType.BROADCASTER_UPDATE]: OPERATION_TYPES.BROADCASTER_UPDATE as Hex,
  [CoreOperationType.RECOVERY_UPDATE]: OPERATION_TYPES.RECOVERY_UPDATE as Hex,
  [CoreOperationType.TIMELOCK_UPDATE]: OPERATION_TYPES.TIMELOCK_UPDATE as Hex
};

/**
 * WorkflowManager provides a simplified interface for executing all types of operations
 * using the operation registry to standardize workflows.
 */
export class WorkflowManager {
  private contract: SecureOwnable;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private contractAddress: Address;
  private chain: Chain;
  private broadcaster: Address = '0x0000000000000000000000000000000000000000' as Address;
  private contractInfo?: SecureContractInfo;
  private storeTransaction?: (txId: string, signedData: string, metadata?: Record<string, unknown>) => void;
  private contractType?: string;

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient | undefined,
    contractAddress: Address,
    chain: Chain,
    contractType?: string,
    storeTransaction?: (txId: string, signedData: string, metadata?: Record<string, unknown>) => void
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.contractAddress = contractAddress;
    this.chain = chain;
    this.contract = new SecureOwnable(publicClient, walletClient, contractAddress, chain);
    this.storeTransaction = storeTransaction;
    this.contractType = contractType;

    // Register core operations with the registry
    registerCoreOperations(this.contract);
    
    // Register Blox-specific operations if contract type is provided
    if (contractType && hasOperationsForContractType(contractType)) {
      // Initialize Blox operations in the background
      this.initializeBloxOperations(contractType);
    }
  }

  /**
   * Initialize Blox operations
   * @param contractType The contract type
   */
  private async initializeBloxOperations(contractType: string): Promise<void> {
    try {
      // Split contract type to extract bloxId if present (format might be like "SimpleRWA20:simple-rwa-20")
      const parts = contractType.split(':');
      const actualContractType = parts[0];
      
      // Store the bloxId if it's part of the contract type
      if (parts.length > 1) {
        this.contractInfo = {
          ...this.contractInfo,
          bloxId: parts[1]
        } as SecureContractInfo;
      }
      
      // Use the original approach with the actual contract type
      await registerBloxOperations(
        actualContractType,
        this.contract,
        this.contractAddress,
        this.publicClient,
        this.walletClient,
        this.chain
      );
    } catch (error) {
      console.error(`Failed to register Blox operations for ${contractType}:`, error);
    }
  }

  /**
   * Initializes the workflow manager by loading contract information
   */
  async initialize(): Promise<SecureContractInfo> {
    // Load contract info and set broadcaster
    this.contractInfo = await this.loadContractInfo();
    this.broadcaster = this.contractInfo.broadcaster as Address;
    return this.contractInfo;
  }

  /**
   * Loads basic contract information
   */
  private async loadContractInfo(): Promise<SecureContractInfo> {
    const [owner, broadcaster, recovery, timeLockPeriodInMinutes, chainId] = await Promise.all([
      this.contract.owner(),
      this.contract.getBroadcaster(),
      this.contract.getRecoveryAddress(),
      this.contract.getTimeLockPeriodInMinutes(),
      this.publicClient.getChainId()
    ]);

    // Get a properly typed chain name
    const chainName = typeof this.chain.name === 'string' ? this.chain.name : 'Unknown Chain';

    return {
      address: this.contractAddress,
      contractAddress: this.contractAddress,
      owner,
      broadcaster,
      recoveryAddress: recovery,
      timeLockPeriodInMinutes: Number(timeLockPeriodInMinutes),
      pendingOperations: [],
      recentEvents: [],
      chainId,
      chainName,
      operationHistory: [],
      contractType: this.contractType
    };
  }

  /**
   * Gets the contract-level hash for an operation type
   */
  private getOperationTypeHash(operationType: OperationType): Hex {
    const operation = operationRegistry.getOperation(operationType);
    if (operation) {
      return operation.operationTypeHash;
    }
    
    // Fallback to the map for core operations
    if (operationType in OPERATION_TYPE_HASH_MAP) {
      return OPERATION_TYPE_HASH_MAP[operationType as CoreOperationType];
    }
    
    throw new Error(`Unknown operation type: ${operationType}`);
  }

  /**
   * Checks if the connected wallet is authorized to perform a specific operation phase
   */
  canExecutePhase(
    operationType: OperationType,
    phase: OperationPhase,
    connectedAddress?: Address
  ): boolean {
    if (!connectedAddress || !this.contractInfo) return false;
    
    // Map SecureContractInfo to ContractRoleInfo interface
    const contractInfoForAuth: ContractRoleInfo = {
      owner: this.contractInfo.owner as Address,
      broadcaster: this.contractInfo.broadcaster as Address,
      recovery: this.contractInfo.recoveryAddress as Address
    };
    
    // Special case for ownership transfer cancellation
    if (operationType === CoreOperationType.OWNERSHIP_TRANSFER && phase === OperationPhase.CANCEL) {
      return contractInfoForAuth.recovery?.toLowerCase() === connectedAddress.toLowerCase();
    }
    
    return canExecuteOperationPhase(
      operationType,
      phase,
      connectedAddress,
      contractInfoForAuth
    );
  }

  // MULTI-PHASE OPERATION METHODS

  /**
   * Initiates a request for a multi-phase operation
   */
  async requestOperation(
    operationType: OperationType,
    params: any,
    options: TransactionOptions
  ): Promise<Hash> {
    const operation = operationRegistry.getOperation(operationType);
    if (!operation) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    if (!isMultiPhaseOperation(operation)) {
      throw new Error(`Operation ${operation.name} is not a multi-phase operation`);
    }

    if (!this.canExecutePhase(operationType, OperationPhase.REQUEST, options.from)) {
      throw new Error(`Account ${options.from} is not authorized to request this operation`);
    }

    const result = await operation.functions.request(params, options);
    return result.hash;
  }

  /**
   * Approves a pending multi-phase operation
   */
  async approveOperation(
    operationType: OperationType,
    txId: bigint,
    options: TransactionOptions
  ): Promise<Hash> {
    const operation = operationRegistry.getOperation(operationType);
    if (!operation) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    if (!isMultiPhaseOperation(operation)) {
      throw new Error(`Operation ${operation.name} is not a multi-phase operation`);
    }

    if (!this.canExecutePhase(operationType, OperationPhase.APPROVE, options.from)) {
      throw new Error(`Account ${options.from} is not authorized to approve this operation`);
    }

    const result = await operation.functions.approve(txId, options);
    return result.hash;
  }

  /**
   * Cancels a pending multi-phase operation
   */
  async cancelOperation(
    operationType: OperationType,
    txId: bigint,
    options: TransactionOptions
  ): Promise<Hash> {
    const operation = operationRegistry.getOperation(operationType);
    if (!operation) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    if (!isMultiPhaseOperation(operation)) {
      throw new Error(`Operation ${operation.name} is not a multi-phase operation`);
    }

    if (!this.canExecutePhase(operationType, OperationPhase.CANCEL, options.from)) {
      throw new Error(`Account ${options.from} is not authorized to cancel this operation`);
    }

    const result = await operation.functions.cancel(txId, options);
    return result.hash;
  }

  /**
   * Prepares and signs a meta-transaction for approving a pending operation
   */
  async prepareAndSignApproval(
    operationType: OperationType,
    txId: bigint,
    options: TransactionOptions
  ): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Wallet client is required');
    }

    const operation = operationRegistry.getOperation(operationType);
    if (!operation) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    if (!isMultiPhaseOperation(operation)) {
      throw new Error(`Operation ${operation.name} is not a multi-phase operation`);
    }

    if (!this.canExecutePhase(operationType, OperationPhase.META_APPROVE, options.from)) {
      throw new Error(`Account ${options.from} is not authorized to approve this operation via meta-transaction`);
    }

    // Use the operation's prepareMetaTxApprove method directly if available
    if (isMultiPhaseOperation(operation) && operation.functions.prepareMetaTxApprove) {
      return await operation.functions.prepareMetaTxApprove(txId, options);
    }

    // Get the function selector for the approve meta-tx function
    let functionSelector: Hex;
    functionSelector = this.getMetaTxFunctionSelector(operationType, 'approve');

    // Generate meta-transaction parameters
    const metaTxParams = await this.contract.createMetaTxParams(
      this.broadcaster,
      functionSelector,
      BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
      BigInt(0), // No max gas price
      options.from
    );

    // Generate unsigned meta-transaction for existing tx
    const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForExisting(
      txId,
      metaTxParams
    );

    // Use the centralized utility to sign the meta transaction
    return await prepareAndSignMetaTransaction(
      this.walletClient,
      unsignedMetaTx,
      this.contractAddress,
      options,
      {
        type: operation.name.replace(/\s+/g, '_').toUpperCase(),
        operationType,
        action: 'approve'
      },
      this.storeTransaction
    );
  }

  /**
   * Prepares and signs a meta-transaction for canceling a pending operation
   */
  async prepareAndSignCancellation(
    operationType: OperationType,
    txId: bigint,
    options: TransactionOptions
  ): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Wallet client is required');
    }

    const operation = operationRegistry.getOperation(operationType);
    if (!operation) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    if (!isMultiPhaseOperation(operation)) {
      throw new Error(`Operation ${operation.name} is not a multi-phase operation`);
    }

    if (!this.canExecutePhase(operationType, OperationPhase.META_CANCEL, options.from)) {
      throw new Error(`Account ${options.from} is not authorized to cancel this operation via meta-transaction`);
    }

    // Use the operation's prepareMetaTxCancel method directly if available
    if (isMultiPhaseOperation(operation) && operation.functions.prepareMetaTxCancel) {
      return await operation.functions.prepareMetaTxCancel(txId, options);
    }

    // Get the function selector for the cancel meta-tx function
    let functionSelector: Hex;
    functionSelector = this.getMetaTxFunctionSelector(operationType, 'cancel');

    // Generate meta-transaction parameters
    const metaTxParams = await this.contract.createMetaTxParams(
      this.broadcaster,
      functionSelector,
      BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
      BigInt(0), // No max gas price
      options.from
    );

    // Generate unsigned meta-transaction for existing tx
    const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForExisting(
      txId,
      metaTxParams
    );

    // Use the centralized utility to sign the meta transaction
    return await prepareAndSignMetaTransaction(
      this.walletClient,
      unsignedMetaTx,
      this.contractAddress,
      options,
      {
        type: operation.name.replace(/\s+/g, '_').toUpperCase(),
        operationType,
        action: 'cancel'
      },
      this.storeTransaction
    );
  }

  /**
   * Gets the appropriate function selector for a meta-transaction based on operation type and action
   */
  private getMetaTxFunctionSelector(operationType: OperationType, action: 'approve' | 'cancel' | 'requestAndApprove'): Hex {
    // Get operation from registry
    const operation = operationRegistry.getOperation(operationType);
    if (!operation) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    // If we're using core operations, look them up directly
    if (operationType === CoreOperationType.OWNERSHIP_TRANSFER) {
      if (action === 'approve') return FUNCTION_SELECTORS.TRANSFER_OWNERSHIP_APPROVE_META as Hex;
      if (action === 'cancel') return FUNCTION_SELECTORS.TRANSFER_OWNERSHIP_CANCEL_META as Hex;
    } else if (operationType === CoreOperationType.BROADCASTER_UPDATE) {
      if (action === 'approve') return FUNCTION_SELECTORS.UPDATE_BROADCASTER_APPROVE_META as Hex;
      if (action === 'cancel') return FUNCTION_SELECTORS.UPDATE_BROADCASTER_CANCEL_META as Hex;
    } else if (operationType === CoreOperationType.RECOVERY_UPDATE) {
      if (action === 'requestAndApprove') return FUNCTION_SELECTORS.UPDATE_RECOVERY_META as Hex;
    } else if (operationType === CoreOperationType.TIMELOCK_UPDATE) {
      if (action === 'requestAndApprove') return FUNCTION_SELECTORS.UPDATE_TIMELOCK_META as Hex;
    }

    // For custom operations, this information should be stored in the operation's metadata
    // This is a simplified version - in a real implementation, this information would be
    // part of the operation registration
    throw new Error(`No function selector found for operation ${operationType} and action ${action}`);
  }

  /**
   * Handles BigInt serialization for JSON
   */
  private bigIntReplacer(_key: string, value: any): any {
    if (typeof value === "bigint") {
      return value.toString() + 'n';
    }
    return value;
  }

  /**
   * Handles BigInt deserialization from JSON
   */
  private bigIntReviver(_key: string, value: any): any {
    if (typeof value === 'string' && /^\d+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return value;
  }

  /**
   * Executes a signed meta-transaction
   */
  async executeMetaTransaction(
    signedMetaTxJson: string,
    operationType: OperationType,
    action: 'approve' | 'cancel' | 'requestAndApprove',
    options: TransactionOptions
  ): Promise<Hash> {
    const operation = operationRegistry.getOperation(operationType);
    if (!operation) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    // Parse the signed meta-transaction
    const signedMetaTx = JSON.parse(signedMetaTxJson, this.bigIntReviver) as MetaTransaction;

    // Execute the appropriate function based on operation type and action
    if (isMultiPhaseOperation(operation)) {
      if (action === 'approve') {
        const result = await operation.functions.approveWithMetaTx(signedMetaTx, options);
        return result.hash;
      } else if (action === 'cancel') {
        const result = await operation.functions.cancelWithMetaTx(signedMetaTx, options);
        return result.hash;
      }
    } else if (isSinglePhaseOperation(operation)) {
      if (action === 'requestAndApprove') {
        const result = await operation.functions.requestAndApproveWithMetaTx(signedMetaTx, options);
        return result.hash;
      }
    }

    throw new Error(`Unsupported action '${action}' for operation type '${operation.name}'`);
  }

  /**
   * Prepares and signs a meta-transaction for a single-phase operation
   */
  async prepareAndSignSinglePhaseOperation(
    operationType: OperationType,
    params: any,
    options: TransactionOptions
  ): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Wallet client is required');
    }

    const operation = operationRegistry.getOperation(operationType);
    if (!operation) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    if (!isSinglePhaseOperation(operation)) {
      throw new Error(`Operation ${operation.name} is not a single-phase operation`);
    }

    if (!this.canExecutePhase(operationType, OperationPhase.REQUEST, options.from)) {
      throw new Error(`Account ${options.from} is not authorized to request this operation`);
    }

    // Use the operation's prepareMetaTx method directly if available
    if (isSinglePhaseOperation(operation) && operation.functions.prepareMetaTx) {
      return await operation.functions.prepareMetaTx(params, options);
    }

    // Get execution options for the operation or use default '0x' if not provided
    // Some operations (like SimpleRWA20) handle execution options in their smart contracts
    // and don't need to construct them at the SDK level, so we use a default empty value
    const executionOptions = operation.functions.getExecutionOptions 
      ? await operation.functions.getExecutionOptions(params) 
      : '0x' as `0x${string}`;

    // Get the function selector
    let functionSelector: Hex;
    functionSelector = this.getMetaTxFunctionSelector(operationType, 'requestAndApprove');

    // Generate meta-transaction parameters
    const metaTxParams = await this.contract.createMetaTxParams(
      this.broadcaster,
      functionSelector,
      BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
      BigInt(0), // No max gas price
      options.from
    );

    // Generate unsigned meta-transaction for new operation
    const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForNew(
      options.from,
      this.contractAddress,
      BigInt(0), // No value
      BigInt(0), // No gas limit
      this.getOperationTypeHash(operationType),
      ExecutionType.STANDARD,
      executionOptions,
      metaTxParams
    );

    // Use the centralized utility to sign the meta transaction
    return await prepareAndSignMetaTransaction(
      this.walletClient,
      unsignedMetaTx,
      this.contractAddress,
      options,
      {
        type: operation.name.replace(/\s+/g, '_').toUpperCase(),
        operationType,
        action: 'requestAndApprove'
      },
      this.storeTransaction
    );
  }
}