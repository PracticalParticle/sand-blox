import { Address, Hex } from 'viem';
import { TransactionOptions, TransactionResult } from '../particle-core/sdk/typescript/interfaces/base.index';
import { MetaTransaction } from '../particle-core/sdk/typescript/interfaces/lib.index';

/**
 * Represents the execution phase of an operation
 */
export enum OperationPhase {
  REQUEST = 'request',
  APPROVE = 'approve',
  CANCEL = 'cancel',
  META_APPROVE = 'metaApprove',
  META_CANCEL = 'metaCancel'
}

/**
 * Defines the workflow type of an operation
 */
export enum WorkflowType {
  MULTI_PHASE = 'multi-phase',
  SINGLE_PHASE = 'single-phase'
}

/**
 * Core operation types as human-readable strings
 */
export enum CoreOperationType {
  OWNERSHIP_TRANSFER = 'OWNERSHIP_TRANSFER',
  BROADCASTER_UPDATE = 'BROADCASTER_UPDATE',
  RECOVERY_UPDATE = 'RECOVERY_UPDATE',
  TIMELOCK_UPDATE = 'TIMELOCK_UPDATE'
}

/**
 * Operation type - either a core type or a custom string
 */
export type OperationType = CoreOperationType | string;

/**
 * Interface for multi-phase operation functions
 */
export interface MultiPhaseOperationFunctions {
  // Request phase
  request: (params: any, options: TransactionOptions) => Promise<TransactionResult>;
  
  // Approval phase
  approve: (txId: bigint, options: TransactionOptions) => Promise<TransactionResult>;
  approveWithMetaTx: (metaTx: MetaTransaction, options: TransactionOptions) => Promise<TransactionResult>;
  
  // Cancellation phase
  cancel: (txId: bigint, options: TransactionOptions) => Promise<TransactionResult>;
  cancelWithMetaTx: (metaTx: MetaTransaction, options: TransactionOptions) => Promise<TransactionResult>;
  
  // Meta-transaction preparation
  prepareMetaTxApprove?: (txId: bigint, options: TransactionOptions) => Promise<string>;
  prepareMetaTxCancel?: (txId: bigint, options: TransactionOptions) => Promise<string>;
}

/**
 * Interface for single-phase operation functions
 */
export interface SinglePhaseOperationFunctions {
  // Get execution options for preparing meta-transaction
  // This is optional because some implementations may handle execution options creation 
  // directly in their smart contracts (e.g., SimpleRWA20) while others need to
  // construct them at the SDK level (e.g., RecoveryUpdate, TimeLockUpdate)
  getExecutionOptions?: (params: any) => Promise<Hex>;
  
  // Combined request and approval with meta-transaction
  requestAndApproveWithMetaTx: (metaTx: MetaTransaction, options: TransactionOptions) => Promise<TransactionResult>;
  
  // Meta-transaction preparation
  prepareMetaTx?: (params: any, options: TransactionOptions) => Promise<string>;
}

/**
 * Defines metadata for an operation type 
 */
export interface OperationTypeInfo {
  // Human-readable operation type 
  operationType: OperationType;
  
  // Unique identifier hash for the operation (used in smart contracts)
  operationTypeHash: Hex;
  
  // Human-readable name of the operation
  name: string;
  
  // Workflow type (multi-phase or single-phase)
  workflowType: WorkflowType;
  
  // Required roles that can execute this operation
  requiredRoles: {
    request?: 'owner' | 'recovery' | string[];
    approve?: 'owner' | 'recovery' | string[];
    cancel?: 'owner' | 'recovery' | string[];
    // Meta-transaction specific roles
    metaApprove?: 'owner' | string[];
    metaCancel?: 'owner' | string[];
  };
  
  // Function selector for the execution function
  functionSelector: Hex;
  
  // Description of the operation
  description: string;
}

/**
 * Registry entry for an operation
 */
export interface OperationRegistryEntry extends OperationTypeInfo {
  // Functions for this operation based on workflow type
  functions: MultiPhaseOperationFunctions | SinglePhaseOperationFunctions;
  // The ID of the blox that owns this operation
  bloxId?: string;
}

/**
 * Type guard to check if operation is multi-phase
 */
export function isMultiPhaseOperation(
  operation: OperationRegistryEntry
): operation is OperationRegistryEntry & { functions: MultiPhaseOperationFunctions } {
  return operation.workflowType === WorkflowType.MULTI_PHASE;
}

/**
 * Type guard to check if operation is single-phase
 */
export function isSinglePhaseOperation(
  operation: OperationRegistryEntry
): operation is OperationRegistryEntry & { functions: SinglePhaseOperationFunctions } {
  return operation.workflowType === WorkflowType.SINGLE_PHASE;
}

/**
 * Operation Registry interface
 */
export interface OperationRegistry {
  // Get operation entry by type
  getOperation(operationType: OperationType): OperationRegistryEntry | undefined;
  
  // Get operation by contract-level hash
  getOperationByHash(operationTypeHash: Hex): OperationRegistryEntry | undefined;
  
  // Get all registered operations
  getAllOperations(): OperationRegistryEntry[];
  
  // Get operations by workflow type
  getOperationsByWorkflowType(workflowType: WorkflowType): OperationRegistryEntry[];
  
  // Register a new operation
  registerOperation(operation: OperationRegistryEntry): void;
}

/**
 * Implementation of the Operation Registry
 */
export class StandardOperationRegistry implements OperationRegistry {
  private operations: Map<string, OperationRegistryEntry> = new Map();
  private operationsByHash: Map<string, OperationRegistryEntry> = new Map();
  
  constructor() {
    // Initialize with known operations
    this.registerDefaultOperations();
  }
  
  /**
   * Register the default core operations
   */
  private registerDefaultOperations() {
    // This will be populated by each module's registration function
  }
  
  /**
   * Get an operation by its human-readable type identifier
   */
  getOperation(operationType: OperationType): OperationRegistryEntry | undefined {
    return this.operations.get(operationType);
  }

  /**
   * Get an operation by its contract-level hash
   */
  getOperationByHash(operationTypeHash: Hex): OperationRegistryEntry | undefined {
    return this.operationsByHash.get(operationTypeHash);
  }
  
  /**
   * Get all registered operations
   */
  getAllOperations(): OperationRegistryEntry[] {
    return Array.from(this.operations.values());
  }
  
  /**
   * Get operations filtered by workflow type
   */
  getOperationsByWorkflowType(workflowType: WorkflowType): OperationRegistryEntry[] {
    return this.getAllOperations().filter(op => op.workflowType === workflowType);
  }
  
  /**
   * Register a new operation
   */
  registerOperation(operation: OperationRegistryEntry): void {
    this.operations.set(operation.operationType, operation);
    this.operationsByHash.set(operation.operationTypeHash, operation);
  }
}

/**
 * Global operation registry instance
 */
export const operationRegistry = new StandardOperationRegistry();

/**
 * Utility function to get human-readable name for an operation type
 */
export function getOperationName(operationType: OperationType, fallback: string = 'Unknown Operation'): string {
  const operation = operationRegistry.getOperation(operationType);
  return operation?.name || fallback;
}

/**
 * Utility function to determine if an operation requires time delay
 */
export function operationRequiresTimeDelay(operationType: OperationType): boolean {
  const operation = operationRegistry.getOperation(operationType);
  return operation?.workflowType === WorkflowType.MULTI_PHASE;
}

/**
 * Interface for contract info with role addresses
 */
export interface ContractRoleInfo {
  [key: string]: any;
  owner: Address;
  broadcaster: Address;
  recovery: Address;
}

/**
 * Utility to generate authorization check for an operation phase
 */
export function canExecuteOperationPhase(
  operationType: OperationType, 
  phase: OperationPhase,
  connectedAccount: Address,
  contractInfo: ContractRoleInfo
): boolean {
  const operation = operationRegistry.getOperation(operationType);
  if (!operation) return false;
  
  const requiredRole = operation.requiredRoles[phase];
  if (!requiredRole) return false;
  
  if (Array.isArray(requiredRole)) {
    return requiredRole.some(role => {
      const roleAddress = contractInfo[role.toLowerCase()];
      return roleAddress?.toLowerCase() === connectedAccount.toLowerCase();
    });
  } else {
    const roleAddress = contractInfo[requiredRole.toLowerCase()];
    return roleAddress?.toLowerCase() === connectedAccount.toLowerCase();
  }
} 