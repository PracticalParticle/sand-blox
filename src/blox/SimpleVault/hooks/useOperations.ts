import { useState, useCallback, useEffect, useMemo } from 'react';
import { Address, Hex } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useChain } from '@/hooks/useChain';
import { useMetaTransactionManager } from '@/hooks/useMetaTransactionManager';
import { useOperationHistory } from '@/hooks/useOperationHistory';
import { convertBigIntsToStrings } from '@/lib/utils';
import { NotificationMessage, VaultTxRecord } from '../lib/types';
import { createVaultMetaTxParams } from '../lib/operations';
import { SimpleVaultService } from '../lib/services';
import SimpleVault from '../SimpleVault';
import { prepareAndSignMetaTransaction } from '@/lib/MetaTxUtils';

// Valid operation types for SimpleVault
export const VAULT_OPERATIONS = {
  WITHDRAW_ETH: "WITHDRAW_ETH",
  WITHDRAW_TOKEN: "WITHDRAW_TOKEN"
} as const;

export type VaultOperationType = typeof VAULT_OPERATIONS[keyof typeof VAULT_OPERATIONS];

// Type for the transactions record to match MetaTransactionManager
interface TransactionRecord {
  [key: string]: {
    signedData: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  };
}

interface UseOperationsProps {
  contractAddress: Address;
  onSuccess?: (message: NotificationMessage) => void;
  onError?: (message: NotificationMessage) => void;
  onRefresh?: () => void;
}

interface UseOperationsReturn {
  // Meta Transaction Actions
  handleMetaTxSign: (tx: VaultTxRecord, type: 'approve' | 'cancel') => Promise<void>;
  handleBroadcastMetaTx: (tx: VaultTxRecord, type: 'approve' | 'cancel') => Promise<void>;
  signedMetaTxStates: Record<string, { type: 'approve' | 'cancel' }>;
  
  // TimeLoad Actions
  handleApproveWithdrawal: (txId: number) => Promise<void>;
  handleCancelWithdrawal: (txId: number) => Promise<void>;
  
  // Loading states
  loadingStates: {
    approval: Record<number, boolean>;
    cancellation: Record<number, boolean>;
    metaTx: boolean;
  };
  
  // Operation filtering
  vaultOperations: VaultTxRecord[];
  statusFilter: string | null;
  operationTypeFilter: string | null;
  setStatusFilter: (filter: string | null) => void;
  setOperationTypeFilter: (filter: string | null) => void;
  getOperationName: (operationType: Hex) => string;
  operationTypes: Map<Hex, string>;
  isLoading: boolean;

  // Service instance
  vaultService: SimpleVaultService | null;
}

export function useOperations({
  contractAddress,
  onSuccess,
  onError,
  onRefresh
}: UseOperationsProps): UseOperationsReturn {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chain = useChain();
  
  // Meta transaction manager
  const { transactions, storeTransaction, error: txManagerError } = useMetaTransactionManager(contractAddress);
  
  // States
  const [vaultService, setVaultService] = useState<SimpleVaultService | null>(null);
  const [vault, setVault] = useState<SimpleVault | null>(null);
  const [operations, setOperations] = useState<VaultTxRecord[]>([]);
  const [isLoadingOperations, setIsLoadingOperations] = useState(false);
  const [signedMetaTxStates, setSignedMetaTxStates] = useState<Record<string, { type: 'approve' | 'cancel' }>>({});
  const [loadingStates, setLoadingStates] = useState<{
    approval: Record<number, boolean>;
    cancellation: Record<number, boolean>;
    metaTx: boolean;
  }>({
    approval: {},
    cancellation: {},
    metaTx: false
  });

  // Initialize services
  useEffect(() => {
    if (!publicClient || !chain || !contractAddress) return;
    
    const initializeServices = async () => {
      try {
        const newVault = new SimpleVault(
          publicClient, 
          walletClient || undefined, 
          contractAddress, 
          chain
        );
        setVault(newVault);

        const newService = new SimpleVaultService(
          publicClient,
          walletClient || undefined,
          contractAddress,
          chain
        );
        setVaultService(newService);

        // Fetch initial operations
        setIsLoadingOperations(true);
        const txs = await newService.getPendingTransactions();
        setOperations(txs);
      } catch (error) {
        console.error('Failed to initialize services:', error);
        onError?.({
          type: 'error',
          title: 'Initialization Failed',
          description: error instanceof Error ? error.message : 'Failed to initialize services'
        });
      } finally {
        setIsLoadingOperations(false);
      }
    };

    initializeServices();
  }, [publicClient, walletClient, contractAddress, chain, onError]);

  // Add error handling for transaction manager
  useEffect(() => {
    if (txManagerError) {
      onError?.({
        type: 'error',
        title: 'Transaction Manager Error',
        description: txManagerError.message
      });
    }
  }, [txManagerError, onError]);

  // Refresh operations
  const refreshOperations = useCallback(async () => {
    if (!vaultService) return;
    
    setIsLoadingOperations(true);
    try {
      const txs = await vaultService.getPendingTransactions();
      setOperations(txs);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to refresh operations:', error);
      onError?.({
        type: 'error',
        title: 'Refresh Failed',
        description: error instanceof Error ? error.message : 'Failed to refresh operations'
      });
    } finally {
      setIsLoadingOperations(false);
    }
  }, [vaultService, onError, onRefresh]);

  // Operation History hooks for filtering
  const {
    filteredOperations,
    statusFilter,
    operationTypeFilter,
    setStatusFilter,
    setOperationTypeFilter,
    getOperationName,
    operationTypes,
    loadingTypes
  } = useOperationHistory({
    contractAddress,
    operations,
    isLoading: isLoadingOperations
  });

  // Filter for vault-specific operations
  const vaultOperations = useMemo(() => {
    return filteredOperations.filter(op => {
      const operationType = getOperationName(op.params.operationType as Hex);
      return Object.values(VAULT_OPERATIONS).includes(operationType as VaultOperationType);
    }) as VaultTxRecord[];
  }, [filteredOperations, getOperationName]);

  // Filter operation types to only show vault operations
  const vaultOperationTypes = useMemo(() => {
    const filteredTypes = new Map<Hex, string>();
    operationTypes.forEach((value, key) => {
      if (Object.values(VAULT_OPERATIONS).includes(value as VaultOperationType)) {
        filteredTypes.set(key, value);
      }
    });
    return filteredTypes;
  }, [operationTypes]);

  // META TRANSACTION FUNCTIONS
  // Sign a withdrawal approval meta transaction
  const signWithdrawalApproval = useCallback(async (txId: string, txType: "ETH" | "TOKEN") => {
    if (!walletClient || !vault || !address) {
      throw new Error('Wallet not connected or services not initialized');
    }

    setLoadingStates(prev => ({ ...prev, metaTx: true }));

    try {
      // Get stored settings and create meta tx params
      if (!vaultService) throw new Error('Service not initialized');
      const storedSettings = vaultService.getStoredMetaTxSettings();
      const metaTxParams = createVaultMetaTxParams(storedSettings);

      // Generate unsigned meta transaction
      const unsignedMetaTx = await vault.generateUnsignedWithdrawalMetaTxApproval(
        BigInt(txId),
        metaTxParams
      );

      // Map the transaction type to the correct operation type
      const operationType = txType === "ETH" ? VAULT_OPERATIONS.WITHDRAW_ETH : VAULT_OPERATIONS.WITHDRAW_TOKEN;

      // Use centralized utility to sign the meta transaction
      const signedMetaTxJson = await prepareAndSignMetaTransaction(
        walletClient,
        unsignedMetaTx,
        contractAddress,
        { from: address },
        {
          type: operationType,
          action: 'approve'
        }
        // Don't pass storeTransaction here, we'll handle storage separately
      );

      // Parse and return the signed meta transaction
      return JSON.parse(signedMetaTxJson);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to sign meta transaction');
    } finally {
      setLoadingStates(prev => ({ ...prev, metaTx: false }));
    }
  }, [vault, vaultService, walletClient, address, contractAddress]);

  // Handle meta transaction signing
  const handleMetaTxSign = useCallback(async (tx: VaultTxRecord, type: 'approve' | 'cancel') => {
    try {
      if (type === 'approve') {
        // Pass the transaction type (ETH or TOKEN) to signWithdrawalApproval
        const signedTx = await signWithdrawalApproval(tx.txId.toString(), tx.type);
        
        // Convert BigInt values to strings for storage
        const serializedTx = convertBigIntsToStrings(signedTx);
        const txId = tx.txId.toString();

        // Get the correct operation type based on the transaction type
        const operationType = tx.type === "ETH" ? VAULT_OPERATIONS.WITHDRAW_ETH : VAULT_OPERATIONS.WITHDRAW_TOKEN;

        // Store the signed transaction
        storeTransaction(
          txId,
          JSON.stringify(serializedTx),
          {
            type: operationType,
            timestamp: Date.now(),
            action: type,
            broadcasted: false,
            status: 'PENDING'
          }
        );

        // Update signed state
        setSignedMetaTxStates(prev => ({
          ...prev,
          [`${txId}-${type}`]: { type }
        }));

        // Force refresh by dispatching a storage event
        const event = new StorageEvent('storage', {
          key: `transactions-${contractAddress}`,
          newValue: JSON.stringify({})
        });
        window.dispatchEvent(event);

        onSuccess?.({
          type: 'success',
          title: 'Meta Transaction Signed',
          description: `Successfully signed approval for ${tx.type} withdrawal #${txId}`
        });
      } else {
        throw new Error('Meta transaction cancellation not implemented');
      }
    } catch (error) {
      console.error('Failed to sign meta transaction:', error);
      onError?.({
        type: 'error',
        title: 'Signing Failed',
        description: error instanceof Error ? error.message : 'Failed to sign meta transaction'
      });
      throw error;
    }
  }, [signWithdrawalApproval, contractAddress, storeTransaction, onSuccess, onError]);

  // Handle meta transaction broadcasting
  const handleBroadcastMetaTx = useCallback(async (tx: VaultTxRecord, type: 'approve' | 'cancel') => {
    if (!walletClient || !vault || !address) {
      throw new Error('Wallet not connected or services not initialized');
    }

    setLoadingStates(prev => ({ ...prev, metaTx: true }));

    try {
      const txId = tx.txId.toString();
      const storedTx = (transactions as TransactionRecord)[txId];
      
      if (!storedTx) {
        throw new Error('No signed transaction found');
      }

      // Parse the signed transaction data
      const signedMetaTx = JSON.parse(storedTx.signedData);

      // Broadcast the meta transaction
      const result = await vault.approveWithdrawalWithMetaTx(
        signedMetaTx,
        { from: address }
      );

      await result.wait();
      
      onSuccess?.({
        type: 'success',
        title: 'Transaction Broadcast',
        description: `Successfully broadcasted ${type} transaction for withdrawal #${txId}`
      });

      // Clear the signed state and refresh transactions
      setSignedMetaTxStates(prev => {
        const newState = { ...prev };
        delete newState[`${txId}-${type}`];
        return newState;
      });
      
      // Refresh operations list
      refreshOperations();
    } catch (error) {
      console.error('Failed to broadcast transaction:', error);
      onError?.({
        type: 'error',
        title: 'Broadcast Failed',
        description: error instanceof Error ? error.message : 'Failed to broadcast transaction'
      });
      throw error;
    } finally {
      setLoadingStates(prev => ({ ...prev, metaTx: false }));
    }
  }, [vault, walletClient, address, transactions, refreshOperations, onSuccess, onError]);

  // TIME LOCK FUNCTIONS
  // Handle withdrawal approval with timelock
  const handleApproveWithdrawal = useCallback(async (txId: number): Promise<void> => {
    if (!vaultService || !address) {
      throw new Error("Services not initialized or wallet not connected");
    }

    setLoadingStates(prev => ({
      ...prev,
      approval: { ...prev.approval, [txId]: true }
    }));

    try {
      const tx = await vaultService.approveWithdrawalAfterDelay(txId, { from: address });
      await tx.wait();

      onSuccess?.({
        type: 'success',
        title: 'Withdrawal Approved',
        description: `Successfully approved withdrawal #${txId}`
      });

      // Refresh operations list
      refreshOperations();
    } catch (error: any) {
      console.error('Approval error:', error);
      onError?.({
        type: 'error',
        title: 'Approval Failed',
        description: error.message || 'Failed to approve withdrawal'
      });
      throw error;
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        approval: { ...prev.approval, [txId]: false }
      }));
    }
  }, [vaultService, address, refreshOperations, onSuccess, onError]);

  // Handle withdrawal cancellation
  const handleCancelWithdrawal = useCallback(async (txId: number): Promise<void> => {
    if (!vaultService || !address) {
      throw new Error("Services not initialized or wallet not connected");
    }

    setLoadingStates(prev => ({
      ...prev,
      cancellation: { ...prev.cancellation, [txId]: true }
    }));

    try {
      const tx = await vaultService.cancelWithdrawal(txId, { from: address });
      await tx.wait();

      onSuccess?.({
        type: 'success',
        title: 'Withdrawal Cancelled',
        description: `Successfully cancelled withdrawal #${txId}`
      });

      // Refresh operations list
      refreshOperations();
    } catch (error: any) {
      console.error('Cancellation error:', error);
      onError?.({
        type: 'error',
        title: 'Cancellation Failed',
        description: error.message || 'Failed to cancel withdrawal'
      });
      throw error;
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        cancellation: { ...prev.cancellation, [txId]: false }
      }));
    }
  }, [vaultService, address, refreshOperations, onSuccess, onError]);

  // Fix the type mismatch by creating wrapper functions
  const setStatusFilterWrapper = useCallback((filter: string | null) => {
    // Pass empty string when null is provided to match the expected type
    setStatusFilter(filter === null ? "" : filter);
  }, [setStatusFilter]);

  const setOperationTypeFilterWrapper = useCallback((filter: string | null) => {
    // Pass empty string when null is provided to match the expected type
    setOperationTypeFilter(filter === null ? "" : filter);
  }, [setOperationTypeFilter]);

  return {
    // Meta transaction actions
    handleMetaTxSign,
    handleBroadcastMetaTx,
    signedMetaTxStates,
    
    // TimeLoad actions
    handleApproveWithdrawal,
    handleCancelWithdrawal,
    
    // Loading states
    loadingStates,
    
    // Operation filtering
    vaultOperations,
    statusFilter,
    operationTypeFilter,
    setStatusFilter: setStatusFilterWrapper,
    setOperationTypeFilter: setOperationTypeFilterWrapper,
    getOperationName,
    operationTypes: vaultOperationTypes,
    isLoading: isLoadingOperations || loadingTypes,

    // Service instance
    vaultService
  };
}
