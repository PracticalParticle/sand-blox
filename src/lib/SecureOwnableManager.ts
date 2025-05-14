import { Address, Chain, Hash, Hex, PublicClient, WalletClient } from 'viem';
import { TxRecord } from '../particle-core/sdk/typescript/interfaces/lib.index';
import { FUNCTION_SELECTORS, OPERATION_TYPES } from '../particle-core/sdk/typescript/types/core.access.index';
import { TransactionResult } from '../particle-core/sdk/typescript/interfaces/base.index';
import { MetaTransaction } from '../particle-core/sdk/typescript/interfaces/lib.index';
import { ExecutionType } from '../particle-core/sdk/typescript/types/lib.index';
import { 
  SecureContractInfo, 
  SecurityOperationEvent, 
  SecurityOperationDetails,
  OperationType
} from './types';
import { getChainName } from './utils';
import SecureOwnable from '../particle-core/sdk/typescript/SecureOwnable';
import { TxStatus } from '../particle-core/sdk/typescript/types/lib.index';
import { prepareAndSignMetaTransaction, bigIntReplacer, bigIntReviver } from './MetaTxUtils';

export class SecureOwnableManager {
  private contract: SecureOwnable;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private chain: Chain;
  private address: Address;
  private storeTransaction?: (txId: string, signedData: string, metadata: any) => void;
  private operationTypeMap: Map<string, string> | null = null;
  private broadcaster: Address =  '0x'; // Initialized with an empty string

  constructor(
    publicClient: PublicClient, 
    walletClient: WalletClient | undefined, 
    address: Address, 
    chain: Chain,
    storeTransaction?: (txId: string, signedData: string, metadata: any) => void
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.chain = chain;
    this.address = address;
    this.contract = new SecureOwnable(publicClient, walletClient, address, chain);
    this.storeTransaction = storeTransaction;
  }

  async init() {
    this.broadcaster = await this.initializeBroadcaster();
  }

  private async initializeBroadcaster(): Promise<Address> {
    return await this.contract.getBroadcaster();
  }
  /**
   * Maps a TxStatus enum value to a string status
   * @param status The numeric status from the contract
   * @returns A string representation of the status
   */
  private mapTxStatusToString(status: number): 'pending' | 'completed' | 'cancelled' {
    switch (status) {
      case TxStatus.PENDING:
        return 'pending';
      case TxStatus.COMPLETED:
        return 'completed';
      case TxStatus.CANCELLED:
      case TxStatus.FAILED:
      case TxStatus.REJECTED:
      case TxStatus.UNDEFINED:
      default:
        return 'cancelled';
    }
  }

  /**
   * Calculates remaining time for a transaction
   * @param releaseTime The release time as a bigint
   * @returns The remaining time in seconds
   */
  private calculateRemainingTime(releaseTime: bigint): number {
    const currentTimeBigInt = BigInt(Math.floor(Date.now() / 1000));
    return releaseTime > currentTimeBigInt ? 
      Number(releaseTime - currentTimeBigInt) : 0;
  }

  /**
   * Maps an operation type hex to a human-readable type
   * @param operationType The operation type as a hex string
   * @returns The operation type as a string
   */
  private async mapOperationType(operationType: Hex): Promise<OperationType> {
    try {
      // Initialize operation type map if not already done
      if (!this.operationTypeMap) {
        const supportedTypes = await this.contract.getSupportedOperationTypes();
        // Only map our core operation types
        const coreOperations = supportedTypes.filter(({ name }) => [
          'OWNERSHIP_TRANSFER',
          'BROADCASTER_UPDATE',
          'RECOVERY_UPDATE',
          'TIMELOCK_UPDATE'
        ].includes(name));
        
        this.operationTypeMap = new Map(
          coreOperations.map(({ operationType, name }) => [operationType, name])
        );
      }

      // Get the operation name from the map
      const operationName = this.operationTypeMap.get(operationType);
      if (!operationName) {
        // If not one of our core operations, return null to be filtered out
        return null as unknown as OperationType;
      }

      // Map the operation name to our internal type
      switch (operationName) {
        case 'OWNERSHIP_TRANSFER':
          return 'ownership';
        case 'BROADCASTER_UPDATE':
          return 'broadcaster';
        case 'RECOVERY_UPDATE':
          return 'recovery';
        case 'TIMELOCK_UPDATE':
          return 'timelock';
        default:
          return null as unknown as OperationType;
      }
    } catch (error) {
      console.error('Error mapping operation type:', error);
      return null as unknown as OperationType;
    }
  }

  /**
   * Converts a TxRecord to a SecurityOperationEvent
   * @param op The transaction record from the contract
   * @returns A SecurityOperationEvent or null if conversion fails
   */
  private async convertToSecurityEvent(op: TxRecord): Promise<SecurityOperationEvent | null> {
    try {
      const status = this.mapTxStatusToString(Number(op.status));
      const type = await this.mapOperationType(op.params.operationType as Hex);
      
      // If the operation type is null (not one of our core types), skip this record
      if (type === null) {
        return null;
      }
      
      const remainingTime = this.calculateRemainingTime(op.releaseTime);

      const details: SecurityOperationDetails = {
        oldValue: op.params.executionOptions,
        newValue: op.params.value.toString(),
        remainingTime
      };

      return {
        type,
        status,
        timestamp: Number(op.releaseTime),
        description: `${type.toUpperCase()} operation`,
        details
      };
    } catch (error) {
      console.warn('Failed to parse operation:', error);
      return null;
    }
  }

  async loadContractInfo(): Promise<SecureContractInfo> {
    try {
      // Fetch contract details using Promise.all for better performance
      const [
        owner,
        broadcaster,
        recoveryAddress,
        timeLockPeriodInMinutes,
        history,
        chainId
      ] = await Promise.all([
        this.contract.owner(),
        this.contract.getBroadcaster(),
        this.contract.getRecoveryAddress(),
        this.contract.getTimeLockPeriodInMinutes(),
        this.contract.getOperationHistory(),
        this.publicClient.getChainId()
      ]);

      // Convert operation history to SecurityOperationEvents
      const events = await Promise.all(
        history.map(op => this.convertToSecurityEvent(op))
      );
      const validEvents = events.filter((event): event is SecurityOperationEvent => event !== null);

      return {
        address: this.address,
        contractAddress: this.address,
        owner,
        broadcaster,
        recoveryAddress,
        timeLockPeriodInMinutes: Number(timeLockPeriodInMinutes),
        pendingOperations: validEvents.filter(e => e.status === 'pending'),
        recentEvents: validEvents.filter(e => e.status !== 'pending').slice(0, 5),
        chainId,
        chainName: getChainName(chainId, [this.chain]),
        operationHistory: history
      };
    } catch (error) {
      console.error('Contract loading error:', error);
      throw error;
    }
  }

  // Ownership Management
  async transferOwnership(options: { from: Address }): Promise<Hash> {
    const result = await this.contract.transferOwnershipRequest(options);
    return result.hash;
  }

  async approveOwnershipTransfer(txId: bigint, options: { from: Address }): Promise<Hash> {
    const result = await this.contract.transferOwnershipDelayedApproval(txId, options);
    return result.hash;
  }

  async cancelOwnershipTransfer(txId: bigint, options: { from: Address }): Promise<Hash> {
    const result = await this.contract.transferOwnershipCancellation(txId, options);
    return result.hash;
  }

  // Broadcaster Management
  async updateBroadcaster(newBroadcaster: Address, options: { from: Address }): Promise<Hash> {
    const result = await this.contract.updateBroadcasterRequest(newBroadcaster, options);
    return result.hash;
  }

  async approveBroadcasterUpdate(txId: bigint, options: { from: Address }): Promise<Hash> {
    const result = await this.contract.updateBroadcasterDelayedApproval(txId, options);
    return result.hash;
  }

  async cancelBroadcasterUpdate(txId: bigint, options: { from: Address }): Promise<Hash> {
    const result = await this.contract.updateBroadcasterCancellation(txId, options);
    return result.hash;
  }

  // Enhanced Recovery Management
  async prepareAndSignRecoveryUpdate(
    newRecoveryAddress: Address,
    options: { from: Address }
  ): Promise<void> {
    if (!this.walletClient) {
      throw new Error('Wallet client is required');
    }
    console.log('prepareAndSignRecoveryUpdate', newRecoveryAddress);
    console.log('prepareAndSignRecoveryUpdate', options);
    
    // Get execution options for recovery update
    const executionOptions = await this.contract.updateRecoveryExecutionOptions(newRecoveryAddress);
    console.log('executionOptions', executionOptions);
    
    // Generate meta transaction parameters
    console.log('broadcaster', this.broadcaster);
    const metaTxParams = await this.contract.createMetaTxParams(
      this.broadcaster,
      FUNCTION_SELECTORS.UPDATE_RECOVERY as Hex,
      BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
      BigInt(0), // No max gas price
      options.from
    );
    
    // Generate unsigned meta transaction     
    console.log('args : ')
    const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForNew(
      options.from,
      this.address,
      BigInt(0), // No value
      BigInt(0), // No gas limit
      OPERATION_TYPES.RECOVERY_UPDATE as Hex,
      ExecutionType.STANDARD,
      executionOptions,
      metaTxParams
    );
    console.log('unsignedMetaTx', unsignedMetaTx);
    
    // Use the centralized utility to sign the meta transaction
    const signedMetaTxJson = await prepareAndSignMetaTransaction(
      this.walletClient,
      unsignedMetaTx,
      this.address,
      options,
      {
        type: 'RECOVERY_UPDATE',
        newRecoveryAddress
      },
      this.storeTransaction
    );
    
    // Parse the JSON to get the signed meta transaction for logging
    const signedMetaTx = JSON.parse(signedMetaTxJson, bigIntReviver);
    console.log('signedMetaTx', signedMetaTx);
  }

  // Enhanced TimeLock Management
  async prepareAndSignTimeLockUpdate(
    newPeriodInMinutes: bigint,
    options: { from: Address }
  ): Promise<void> {
    if (!this.walletClient) {
      throw new Error('Wallet client is required');
    }

    // Get execution options for timelock update
    const executionOptions = await this.contract.updateTimeLockExecutionOptions(newPeriodInMinutes);

    // Generate meta transaction parameters
    console.log('broadcaster', this.broadcaster);
    const metaTxParams = await this.contract.createMetaTxParams(
      this.broadcaster,
      FUNCTION_SELECTORS.UPDATE_TIMELOCK as Hex,
      BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
      BigInt(0), // No max gas price
      options.from
    );

    // Generate unsigned meta transaction
    const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForNew(
      options.from,
      this.address,
      BigInt(0), // No value
      BigInt(0), // No gas limit
      OPERATION_TYPES.TIMELOCK_UPDATE as Hex,
      ExecutionType.STANDARD,
      executionOptions,
      metaTxParams
    );
    console.log('unsignedMetaTx', unsignedMetaTx);
    
    // Use the centralized utility to sign the meta transaction
    const signedMetaTxJson = await prepareAndSignMetaTransaction(
      this.walletClient,
      unsignedMetaTx,
      this.address,
      options,
      {
        type: 'TIMELOCK_UPDATE',
        broadcasted: false,
        newTimeLockPeriod: Number(newPeriodInMinutes)
      },
      this.storeTransaction
    );
    
    // Parse the JSON to get the signed meta transaction for logging
    const signedMetaTx = JSON.parse(signedMetaTxJson, bigIntReviver);
    console.log('signedMetaTx', signedMetaTx);
  }

  /**
   * Prepares and signs a meta transaction for approving a pending ownership transfer
   * @param txId The transaction ID to approve
   * @param options Transaction options with the signer address
   * @returns The signed meta transaction data
   */
  async prepareAndSignOwnershipApproval(
    txId: bigint,
    options: { from: Address }
  ): Promise<string> {
    try {
      if (!this.walletClient) {
        throw new Error('Wallet client is required');
      }

      // Generate meta transaction parameters
      const metaTxParams = await this.contract.createMetaTxParams(
        this.broadcaster,
        FUNCTION_SELECTORS.TRANSFER_OWNERSHIP_APPROVE_META as Hex,
        BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
        BigInt(0), // No max gas price
        options.from
      );

      // Generate unsigned meta transaction for existing tx
      const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForExisting(
        txId,
        metaTxParams
      );

      // Use the centralized utility to sign the meta transaction
      return await prepareAndSignMetaTransaction(
        this.walletClient,
        unsignedMetaTx,
        this.address,
        options,
        {
          type: 'OWNERSHIP_TRANSFER',
          broadcasted: false
        },
        this.storeTransaction
      );
    } catch (error) {
      console.error('Error preparing ownership approval meta transaction:', error);
      throw error;
    }
  }

  /**
   * Prepares and signs a meta transaction for cancelling a pending ownership transfer
   * @param txId The transaction ID to cancel
   * @param options Transaction options with the signer address
   * @returns The signed meta transaction data
   */
  async prepareAndSignOwnershipCancellation(
    txId: bigint,
    options: { from: Address }
  ): Promise<string> {
    try {
      if (!this.walletClient) {
        throw new Error('Wallet client is required');
      }

      // Generate meta transaction parameters
      const metaTxParams = await this.contract.createMetaTxParams(
        this.broadcaster,
        FUNCTION_SELECTORS.TRANSFER_OWNERSHIP_CANCEL_META as Hex,
        BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
        BigInt(0), // No max gas price
        options.from
      );

      // Generate unsigned meta transaction for existing tx
      const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForExisting(
        txId,
        metaTxParams
      );

      // Use the centralized utility to sign the meta transaction
      return await prepareAndSignMetaTransaction(
        this.walletClient,
        unsignedMetaTx,
        this.address,
        options,
        {
          type: 'OWNERSHIP_TRANSFER',
          broadcasted: false
        },
        this.storeTransaction
      );
    } catch (error) {
      console.error('Error preparing ownership cancellation meta transaction:', error);
      throw error;
    }
  }

  /**
   * Prepares and signs a meta transaction for approving a pending broadcaster update
   * @param txId The transaction ID to approve
   * @param options Transaction options with the signer address
   * @returns The signed meta transaction data
   */
  async prepareAndSignBroadcasterApproval(
    txId: bigint,
    options: { from: Address }
  ): Promise<string> {
    try {
      if (!this.walletClient) {
        throw new Error('Wallet client is required');
      }

      // Generate meta transaction parameters
      const metaTxParams = await this.contract.createMetaTxParams(
        this.broadcaster,
        FUNCTION_SELECTORS.UPDATE_BROADCASTER_APPROVE_META as Hex,
        BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
        BigInt(0), // No max gas price
        options.from
      );

      console.log('metaTxParams', metaTxParams);

      // Generate unsigned meta transaction for existing tx
      const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForExisting(
        txId,
        metaTxParams
      );

      console.log('unsignedMetaTx', unsignedMetaTx);
      
      // Use the centralized utility to sign the meta transaction
      return await prepareAndSignMetaTransaction(
        this.walletClient,
        unsignedMetaTx,
        this.address,
        options,
        {
          type: 'BROADCASTER_UPDATE',
          broadcasted: false
        },
        this.storeTransaction
      );
    } catch (error) {
      console.error('Error preparing broadcaster approval meta transaction:', error);
      throw error;
    }
  }

  /**
   * Prepares and signs a meta transaction for cancelling a pending broadcaster update
   * @param txId The transaction ID to cancel
   * @param options Transaction options with the signer address
   * @returns The signed meta transaction data
   */
  async prepareAndSignBroadcasterCancellation(
    txId: bigint,
    options: { from: Address }
  ): Promise<string> {
    try {
      if (!this.walletClient) {
        throw new Error('Wallet client is required');
      }

      // Generate meta transaction parameters
      const metaTxParams = await this.contract.createMetaTxParams(
        this.broadcaster,
        FUNCTION_SELECTORS.UPDATE_BROADCASTER_CANCEL_META as Hex,
        BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
        BigInt(0), // No max gas price
        options.from
      );

      // Generate unsigned meta transaction for existing tx
      const unsignedMetaTx = await this.contract.generateUnsignedMetaTransactionForExisting(
        txId,
        metaTxParams
      );

      // Use the centralized utility to sign the meta transaction
      return await prepareAndSignMetaTransaction(
        this.walletClient,
        unsignedMetaTx,
        this.address,
        options,
        {
          type: 'BROADCASTER_UPDATE',
          broadcasted: false
        },
        this.storeTransaction
      );
    } catch (error) {
      console.error('Error preparing broadcaster cancellation meta transaction:', error);
      throw error;
    }
  }

  /**
   * Executes a signed meta transaction through the contract
   * @param signedMetaTxJson The signed meta transaction as a JSON string
   * @param options Transaction options
   * @param type The type of operation
   * @returns The transaction hash
   */
  async executeMetaTransaction(
    signedMetaTxJson: MetaTransaction, 
    options: { from: Address },
    type: 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE' | 'RECOVERY_UPDATE' | 'TIMELOCK_UPDATE',
    action: 'approve' | 'cancel'
  ): Promise<Hash> {
    try {
      const signedMetaTx = signedMetaTxJson;
      let result: TransactionResult;

      // Execute the appropriate meta transaction based on type and action
      if (type === 'OWNERSHIP_TRANSFER') {
        if (action === 'approve') {
          result = await this.contract.transferOwnershipApprovalWithMetaTx(
            signedMetaTx,
            options
          );
        } else {
          result = await this.contract.transferOwnershipCancellationWithMetaTx(
            signedMetaTx,
            options
          );
        }
      } else if (type === 'BROADCASTER_UPDATE') {
        if (action === 'approve') {
          result = await this.contract.updateBroadcasterApprovalWithMetaTx(
            signedMetaTx,
            options
          );
        } else {
          result = await this.contract.updateBroadcasterCancellationWithMetaTx(
            signedMetaTx,
            options
          );
        }
      } else if (type === 'RECOVERY_UPDATE') {
        console.log('signedMetaTx', signedMetaTx);
        result = await this.contract.updateRecoveryRequestAndApprove(
          signedMetaTx,
          options
        );
      } else if (type === 'TIMELOCK_UPDATE') {
        result = await this.contract.updateTimeLockRequestAndApprove(
          signedMetaTx,
          options
        );
      } else {
        throw new Error(`Unsupported operation type: ${type}`);
      }

      return result.hash;
    } catch (error) {
      console.error('Error executing meta transaction:', error);
      throw error;
    }
  }
} 