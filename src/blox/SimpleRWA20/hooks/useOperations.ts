import { useState, useCallback, useEffect, useMemo } from 'react';
import { Address, Hex } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useChain } from '@/hooks/useChain';
import { useMetaTransactionManager } from '@/hooks/useMetaTransactionManager';
import { useOperationHistory } from '@/hooks/useOperationHistory';
import { NotificationMessage, RWA20TxRecord } from '../lib/types';
import { SimpleRWA20Service } from '../lib/services';
import SimpleRWA20 from '../SimpleRWA20';
import { keccak256 } from 'viem';

// Valid operation types for SimpleRWA20
export const RWA20_OPERATIONS = {
  MINT_TOKENS: "MINT_TOKENS",
  BURN_TOKENS: "BURN_TOKENS"
} as const;

export type RWA20OperationType = typeof RWA20_OPERATIONS[keyof typeof RWA20_OPERATIONS];

interface UseOperationsProps {
  contractAddress: Address;
  onSuccess?: (message: NotificationMessage) => void;
  onError?: (message: NotificationMessage) => void;
  onRefresh?: () => void;
}

interface UseOperationsReturn {
  // Meta Transaction Actions
  handleMetaTxMint: (to: Address, amount: bigint) => Promise<void>;
  handleMetaTxBurn: (from: Address, amount: bigint) => Promise<void>;
  handleBroadcastMetaTx: (tx: RWA20TxRecord, type: 'mint' | 'burn') => Promise<void>;
  signedMetaTxStates: Record<string, { type: 'mint' | 'burn' }>;
  
  // Loading states
  loadingStates: {
    minting: boolean;
    burning: boolean;
    broadcasting: boolean;
  };
  
  // Operation filtering
  rwa20Operations: RWA20TxRecord[];
  statusFilter: string | null;
  operationTypeFilter: string | null;
  setStatusFilter: (filter: string | null) => void;
  setOperationTypeFilter: (filter: string | null) => void;
  getOperationName: (operationType: Hex) => string;
  operationTypes: Map<Hex, string>;
  isLoading: boolean;

  // Service instance
  rwa20Service: SimpleRWA20Service | null;
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
  const { storeTransaction, error: txManagerError } = useMetaTransactionManager(contractAddress);
  
  // States
  const [rwa20Service, setRWA20Service] = useState<SimpleRWA20Service | null>(null);
  const [rwa20, setRWA20] = useState<SimpleRWA20 | null>(null);
  const [operations, setOperations] = useState<RWA20TxRecord[]>([]);
  const [isLoadingOperations, setIsLoadingOperations] = useState(false);
  const [signedMetaTxStates, setSignedMetaTxStates] = useState<Record<string, { type: 'mint' | 'burn' }>>({});
  const [loadingStates, setLoadingStates] = useState<{
    minting: boolean;
    burning: boolean;
    broadcasting: boolean;
  }>({
    minting: false,
    burning: false,
    broadcasting: false
  });

  // Initialize services
  useEffect(() => {
    if (!publicClient || !chain || !contractAddress) return;
    
    const initializeServices = async () => {
      try {
        const newRWA20 = new SimpleRWA20(
          publicClient, 
          walletClient || undefined, 
          contractAddress, 
          chain
        );
        setRWA20(newRWA20);

        const newService = new SimpleRWA20Service(
          publicClient,
          walletClient || undefined,
          contractAddress,
          chain
        );
        setRWA20Service(newService);

        // Fetch initial operations
        setIsLoadingOperations(true);
        const txs = await newService.getTokenOperations();
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
    if (!rwa20Service) return;
    
    setIsLoadingOperations(true);
    try {
      const txs = await rwa20Service.getTokenOperations();
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
  }, [rwa20Service, onError, onRefresh]);

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

  // Filter for RWA20-specific operations
  const rwa20Operations = useMemo(() => {
    return filteredOperations.filter(op => {
      const operationType = getOperationName(op.params.operationType as Hex);
      return Object.values(RWA20_OPERATIONS).includes(operationType as RWA20OperationType);
    }) as RWA20TxRecord[];
  }, [filteredOperations, getOperationName]);

  // Filter operation types to only show RWA20 operations
  const rwa20OperationTypes = useMemo(() => {
    const filteredTypes = new Map<Hex, string>();
    operationTypes.forEach((value, key) => {
      if (Object.values(RWA20_OPERATIONS).includes(value as RWA20OperationType)) {
        filteredTypes.set(key, value);
      }
    });
    return filteredTypes;
  }, [operationTypes]);

  // Generate a signed mint meta transaction
  const generateSignedMintMetaTx = useCallback(async (to: Address, amount: bigint) => {
    if (!walletClient || !rwa20 || !address) {
      throw new Error('Wallet not connected or services not initialized');
    }

    try {
      // Get stored settings and create meta tx params
      if (!rwa20Service) throw new Error('Service not initialized');
      
      // Generate the signed mint meta transaction using the service
      return await rwa20Service.generateSignedMintMetaTx(to, amount, { from: address });
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to sign mint meta transaction');
    }
  }, [rwa20, rwa20Service, walletClient, address]);

  // Generate a signed burn meta transaction
  const generateSignedBurnMetaTx = useCallback(async (from: Address, amount: bigint) => {
    if (!walletClient || !rwa20 || !address) {
      throw new Error('Wallet not connected or services not initialized');
    }

    try {
      // Get stored settings and create meta tx params
      if (!rwa20Service) throw new Error('Service not initialized');
      
      // Generate the signed burn meta transaction using the service
      return await rwa20Service.generateSignedBurnMetaTx(from, amount, { from: address });
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to sign burn meta transaction');
    }
  }, [rwa20, rwa20Service, walletClient, address]);

  // Handle meta transaction minting
  const handleMetaTxMint = useCallback(async (to: Address, amount: bigint): Promise<void> => {
    try {
      setLoadingStates(prev => ({ ...prev, minting: true }));
      
      const signedTxString = await generateSignedMintMetaTx(to, amount);
      
      // Generate a numeric transaction ID using timestamp
      const timestamp = Date.now();
      const txId = timestamp.toString();

      // Store the signed transaction
      storeTransaction(
        txId,
        signedTxString,
        {
          type: 'MINT_TOKENS',
          timestamp,
          to,
          amount: amount.toString(),
          action: 'mint',
          broadcasted: false,
          status: 'PENDING',
          operationType: '0x' + keccak256(new TextEncoder().encode('MINT_TOKENS')).slice(2)
        }
      );

      // Update signed state
      setSignedMetaTxStates(prev => ({
        ...prev,
        [txId]: { type: 'mint' }
      }));

      // Force refresh by dispatching a storage event
      const event = new StorageEvent('storage', {
        key: `transactions-${contractAddress}`,
        newValue: JSON.stringify({})
      });
      window.dispatchEvent(event);

      onSuccess?.({
        type: 'success',
        title: 'Mint Transaction Signed',
        description: `Successfully signed mint transaction for ${amount.toString()} tokens to ${to}`
      });
    } catch (error) {
      console.error('Failed to sign mint transaction:', error);
      onError?.({
        type: 'error',
        title: 'Signing Failed',
        description: error instanceof Error ? error.message : 'Failed to sign mint transaction'
      });
      throw error;
    } finally {
      setLoadingStates(prev => ({ ...prev, minting: false }));
    }
  }, [generateSignedMintMetaTx, contractAddress, storeTransaction, onSuccess, onError]);

  // Handle meta transaction burning
  const handleMetaTxBurn = useCallback(async (from: Address, amount: bigint): Promise<void> => {
    try {
      setLoadingStates(prev => ({ ...prev, burning: true }));
      
      const signedTxString = await generateSignedBurnMetaTx(from, amount);
      
      // Generate a numeric transaction ID using timestamp
      const timestamp = Date.now();
      const txId = timestamp.toString();

      // Store the signed transaction
      storeTransaction(
        txId,
        signedTxString,
        {
          type: 'BURN_TOKENS',
          timestamp,
          from,
          amount: amount.toString(),
          action: 'burn',
          broadcasted: false,
          status: 'PENDING',
          operationType: '0x' + keccak256(new TextEncoder().encode('BURN_TOKENS')).slice(2)
        }
      );

      // Update signed state
      setSignedMetaTxStates(prev => ({
        ...prev,
        [txId]: { type: 'burn' }
      }));

      // Force refresh by dispatching a storage event
      const event = new StorageEvent('storage', {
        key: `transactions-${contractAddress}`,
        newValue: JSON.stringify({})
      });
      window.dispatchEvent(event);

      onSuccess?.({
        type: 'success',
        title: 'Burn Transaction Signed',
        description: `Successfully signed burn transaction for ${amount.toString()} tokens from ${from}`
      });
    } catch (error) {
      console.error('Failed to sign burn transaction:', error);
      onError?.({
        type: 'error',
        title: 'Signing Failed',
        description: error instanceof Error ? error.message : 'Failed to sign burn transaction'
      });
      throw error;
    } finally {
      setLoadingStates(prev => ({ ...prev, burning: false }));
    }
  }, [generateSignedBurnMetaTx, contractAddress, storeTransaction, onSuccess, onError]);

  // Handle meta transaction broadcasting
  const handleBroadcastMetaTx = useCallback(async (tx: RWA20TxRecord, type: 'mint' | 'burn') => {
    if (!walletClient || !rwa20 || !address) {
      throw new Error('Wallet not connected or services not initialized');
    }

    setLoadingStates(prev => ({ ...prev, broadcasting: true }));

    try {
      const txId = tx.txId.toString();
      
      // Get the stored transaction from localStorage directly
      const storedTxKey = `dapp_signed_transactions`;
      const storedData = localStorage.getItem(storedTxKey);
      
      if (!storedData) {
        throw new Error('No stored transactions found');
      }

      const parsedData = JSON.parse(storedData);
      const contractTransactions = parsedData[contractAddress];
      
      if (!contractTransactions) {
        throw new Error('No transactions found for this contract');
      }

      // Use the txId directly to find the transaction
      const storedTx = contractTransactions[txId];
      if (!storedTx) {
        console.error('Available transactions:', Object.keys(contractTransactions));
        throw new Error(`No transaction found with ID ${txId}`);
      }

      // Parse and validate the stored transaction data
      let signedMetaTx;
      try {
        signedMetaTx = JSON.parse(storedTx.signedData);
        
        // Validate required fields
        if (!signedMetaTx.message || !signedMetaTx.signature || !signedMetaTx.params) {
          throw new Error("Invalid meta transaction data structure");
        }
        
        // Convert string values back to BigInt where needed
        signedMetaTx = JSON.parse(JSON.stringify(signedMetaTx), (_, value) => {
          // Convert numeric strings back to BigInt for specific fields
          if (typeof value === 'string' && /^\d+$/.test(value)) {
            if (['chainId', 'nonce', 'deadline', 'maxGasPrice'].includes(_)) {
              return BigInt(value);
            }
          }
          return value;
        });
      } catch (error) {
        console.error('Failed to parse stored transaction:', error);
        throw new Error("Invalid stored transaction data");
      }

      // Broadcast the meta transaction based on type
      let result;
      if (type === 'mint') {
        result = await rwa20.mintWithMetaTx(
          signedMetaTx,
          { from: address }
        );
      } else {
        result = await rwa20.burnWithMetaTx(
          signedMetaTx,
          { from: address }
        );
      }

      await result.wait();
      
      // Remove the transaction after successful broadcast
      if (storeTransaction) {
        storeTransaction(txId, '', { remove: true });
      }
      
      onSuccess?.({
        type: 'success',
        title: 'Transaction Broadcast',
        description: `Successfully broadcasted ${type} transaction`
      });

      // Clear the signed state and refresh transactions
      setSignedMetaTxStates(prev => {
        const newState = { ...prev };
        delete newState[txId];
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
      setLoadingStates(prev => ({ ...prev, broadcasting: false }));
    }
  }, [rwa20, walletClient, address, contractAddress, refreshOperations, onSuccess, onError, storeTransaction]);

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
    handleMetaTxMint,
    handleMetaTxBurn,
    handleBroadcastMetaTx,
    signedMetaTxStates,
    
    // Loading states
    loadingStates,
    
    // Operation filtering
    rwa20Operations,
    statusFilter,
    operationTypeFilter,
    setStatusFilter: setStatusFilterWrapper,
    setOperationTypeFilter: setOperationTypeFilterWrapper,
    getOperationName,
    operationTypes: rwa20OperationTypes,
    isLoading: isLoadingOperations || loadingTypes,

    // Service instance
    rwa20Service
  };
}
