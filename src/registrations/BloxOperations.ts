import { Address, Chain, PublicClient, WalletClient } from 'viem';
import { loadCatalog } from '../lib/catalog';
import { BaseBloxOperationsHandler } from '../types/BloxOperationsHandler';

// Operations registry map - stores operations by blox ID
const bloxOperationsRegistry = new Map<string, BaseBloxOperationsHandler>();

/**
 * Abstract interface for Blox operation handler
 */
export interface BloxOperationsHandler {
  // Get the Blox ID
  getBloxId(): string;
  
  // Register all operations for this Blox
  registerOperations(
    contract: any, 
    contractAddress: Address, 
    publicClient: PublicClient, 
    walletClient?: WalletClient,
    chain?: Chain,
    storeTransaction?: (txId: string, signedData: string, metadata?: Record<string, any>) => void
  ): void;
  
  // Check if this handler can handle a given contract type
  canHandle(contractType: string): boolean;
}

/**
 * Load operations handler for a specific blox by ID
 * @param bloxId The ID of the blox to load operations for
 * @returns Promise resolving to the operations handler or null if not found
 */
export async function loadBloxOperationsByBloxId(bloxId: string): Promise<BaseBloxOperationsHandler | null> {
  try {
    // Check if we already have a handler for this blox
    const existingHandler = bloxOperationsRegistry.get(bloxId);
    if (existingHandler) {
      return existingHandler;
    }

    // Check if this blox exists in the catalog
    const catalog = await loadCatalog();
    const bloxDetails = catalog[bloxId];
    if (!bloxDetails) {
      console.warn(`Blox ID ${bloxId} not found in catalog`);
      return null;
    }
    
    // Skip template and test bloxes
    if (bloxId.toLowerCase().includes('template') || bloxId.toLowerCase().includes('test')) {
      console.log(`Skipping operations for template/test Blox: ${bloxId}`);
      return null;
    }

    // Get the folder name from the catalog
    const folderName = bloxDetails.files.component.split('/').slice(-2)[0];
    if (!folderName) {
      console.warn(`Could not determine folder name for blox: ${bloxId}`);
      return null;
    }

    // Load the operations module using the folder name
    const operationsModule = await import(`@/blox/${folderName}/lib/operations.ts`);
    
    if (!operationsModule?.default) {
      console.warn(`No operations handler found for blox: ${bloxId}`);
      return null;
    }

    // Instantiate the handler class
    const handler = new operationsModule.default();
    
    // Register the handler in the registry
    bloxOperationsRegistry.set(bloxId, handler);
    console.log(`Registered operations handler for Blox: ${bloxId}`);
    
    return handler;
  } catch (error) {
    console.warn(`Failed to load operations for Blox ${bloxId}:`, error);
    return null;
  }
}

/**
 * Load operations for all Blox types from the catalog
 * @deprecated Use loadBloxOperationsByBloxId for targeted loading instead
 */
export async function loadBloxOperations(): Promise<void> {
  try {
    // Clear existing operations
    bloxOperationsRegistry.clear();
    
    // Load the catalog
    const catalog = await loadCatalog();
    
    // Dynamically import operations for each Blox type
    for (const bloxId of Object.keys(catalog)) {
      await loadBloxOperationsByBloxId(bloxId);
    }
    
    console.log(`Loaded operations handlers for ${bloxOperationsRegistry.size} Blox types`);
  } catch (error) {
    console.error('Failed to load Blox operations:', error);
  }
}

/**
 * Register operations for a specific contract instance
 * @param contractType The type of the contract (e.g., 'SimpleRWA20')
 * @param contract The contract instance
 * @param contractAddress The contract address
 * @param publicClient The public client
 * @param walletClient Optional wallet client
 * @param chain Optional chain object
 * @returns Promise that resolves to true if operations were registered, false otherwise
 */
export async function registerBloxOperations(
  contractType: string,
  contract: any,
  contractAddress: Address,
  publicClient: PublicClient,
  walletClient?: WalletClient,
  chain?: Chain
): Promise<boolean> {
  // Find the appropriate handler for this contract type
  for (const handler of bloxOperationsRegistry.values()) {
    if (handler.canHandle(contractType)) {
      await handler.registerOperations(
        contract, 
        contractAddress, 
        publicClient, 
        walletClient, 
        chain
      );
      return true;
    }
  }
  
  console.warn(`No operations handler found for contract type: ${contractType}`);
  return false;
}

/**
 * Register operations for a specific blox by ID
 * Check if operations are available for a given contract type
 * @param contractType The contract type to check
 * @returns True if operations are available, false otherwise
 */
export function hasOperationsForContractType(contractType: string): boolean {
  // Check if any handler can handle this contract type
  for (const handler of bloxOperationsRegistry.values()) {
    if (handler.canHandle(contractType)) {
      return true;
    }
  }
  return false;
}

/**
 * Initialize the Blox operations system
 * This should be called during application startup
 */
export async function initializeBloxOperations(): Promise<void> {
  await loadBloxOperations();
}
