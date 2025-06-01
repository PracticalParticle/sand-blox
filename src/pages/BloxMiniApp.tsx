import { useState, useEffect, Suspense } from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, Shield, ChevronUp, ChevronDown } from 'lucide-react';
import { useSecureOwnable } from '@/hooks/useSecureOwnable';
import { Button } from "@/components/ui/button";
import { getContractDetails, loadBloxContractModule } from '@/lib/catalog';
import type { BloxContract } from '@/lib/catalog/types';
import { getUIComponent, initializeUIComponents } from '@/lib/catalog/bloxUIComponents';
import type { BloxUIProps } from '@/lib/catalog/bloxUIComponents';
import { useConfig, useChainId, useConnect, useAccount, useDisconnect, usePublicClient, useWalletClient } from 'wagmi'
import React from 'react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { ContractInfo } from "@/components/ContractInfo";
import { SecureContractInfo } from "@/lib/types";
import { WalletStatusBadge } from '@/components/WalletStatusBadge';
import { ExtendedSignedTransaction, SignedMetaTxTable } from '@/components/SignedMetaTxTable';
import { OpHistory } from '@/components/OpHistory';
import { useMetaTransactionManager } from '@/hooks/useMetaTransactionManager';
import { useOperationTypes } from '@/hooks/useOperationTypes';
import { Hex } from 'viem';
import { TxRecord } from '@/particle-core/sdk/typescript/interfaces/lib.index';
import { useChain } from '@/hooks/useChain';

import { MetaTransactionManager } from '@/services/MetaTransactionManager';
import { OperationType } from '@/types/OperationRegistry';
import { useWorkflowManager } from '@/hooks/useWorkflowManager';
import { PublicClient, WalletClient, Chain } from 'viem';
import { BloxBroadcastDialog } from '@/components/BloxBroadcastDialog';


// Interface for stored transactions
interface StoredTransaction {
  signedData: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// Interface for signed transactions
interface SignedTransaction {
  txId: string;
  timestamp: number;
  metadata?: {
    type: string;
    action?: 'approve' | 'cancel';
    broadcasted: boolean;
    status?: 'COMPLETED' | 'PENDING';
  };
}

// Animation variants
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

// Helper function to format time values

// Add this component before the BloxMiniApp component:
const SidebarContent = ({ 
  bloxContract, 
  address, 
  contractInfo 
}: { 
  bloxContract: BloxContract | null;
  address: string;
  contractInfo: SecureContractInfo | undefined;
}) => {
  const { toast } = useToast();
  
  if (!bloxContract || !contractInfo) return null;
  
  const BloxUI = getUIComponent(bloxContract.id);
  if (!BloxUI) return null;

  const contractUIInfo = {
    address: address as `0x${string}`,
    type: bloxContract.id || '',
    name: bloxContract.name || '',
    category: bloxContract.category || '',
    description: bloxContract.description || '',
    bloxId: bloxContract.id || '',
    chainId: contractInfo.chainId,
    chainName: contractInfo.chainName || ''
  } satisfies BloxUIProps['contractInfo'];

  return (
    <BloxUI 
      contractAddress={address as `0x${string}`}
      contractInfo={contractUIInfo}
      onError={(error: Error) => {
        toast({
          title: "Operation Failed",
          description: error.message || 'Failed to perform operation',
          variant: "destructive"
        });
      }}
      renderSidebar={true}
    />
  );
};

const BloxMiniApp: React.FC = () => {
  const { type, address } = useParams<{ type: string; address: string }>();
  const { address: connectedAddress } = useAccount();
  const { disconnect } = useDisconnect();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractInfo, setContractInfo] = useState<SecureContractInfo | undefined>(undefined);
  const [bloxContract, setBloxContract] = useState<BloxContract>();
  const [uiInitialized, setUiInitialized] = useState(false);
  const { validateAndLoadContract } = useSecureOwnable();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const config = useConfig()
  const chainId = useChainId()
  const { connectAsync, connectors } = useConnect()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { transactions = {}, clearTransactions, removeTransaction } = useMetaTransactionManager(address || '');
  const [signedTransactions, setSignedTransactions] = useState<SignedTransaction[]>([]);
  const { getOperationName } = useOperationTypes(address as `0x${string}`);
  const [isMobileView, setIsMobileView] = useState(false);
  const [bloxUiLoading, setBloxUiLoading] = useState(true);
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chain = useChain();
  const [tokenBalances, setTokenBalances] = useState<Record<string, { balance: bigint; metadata?: any; loading: boolean; error?: string }>>({});
  const [selectedTransaction, setSelectedTransaction] = useState<ExtendedSignedTransaction | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Initialize workflow manager
  const {
    manager,
    approveOperation,
    cancelOperation,
    refreshAllData
  } = useWorkflowManager(address as `0x${string}`, type);

  // Function to show notifications using toast
  const showNotification = (notification: { type: 'error' | 'warning' | 'info' | 'success'; title: string; description: string }) => {
    toast({
      title: notification.title,
      description: notification.description,
      variant: notification.type === 'error' ? 'destructive' : undefined
    });
  };

  // Add effect to handle screen size changes
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
      setIsSidebarOpen(window.innerWidth >= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize UI components on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeUIComponents();
        setUiInitialized(true);
      } catch (error) {
        console.error('Failed to initialize UI components:', error);
        setError('Failed to initialize UI components');
        showNotification({
          type: 'error',
          title: 'Initialization Failed',
          description: 'Failed to initialize UI components'
        });
      }
    };
    init();
  }, []);

  // Load contract info and blox details
  const loadContractInfo = async () => {
    if (!address || !uiInitialized) return;

    if (contractInfo?.contractAddress === address) {
      setBloxUiLoading(false);
      return;
    }

    setLoading(true);
    setBloxUiLoading(true);
    setError(null);

    try {
      // Load secure contract info
      const info = await validateAndLoadContract(address as `0x${string}`);
      if (!info) {
        throw new Error('Contract info not found');
      }
      
      setContractInfo(info);

      // Get chain name for error messages
      const targetChain = config.chains.find(c => c.id === info.chainId);
      const targetChainName = targetChain?.name || 'Unknown Network';

      // Only show network warning if chain is wrong
      if (chainId !== info.chainId) {
        showNotification({
          type: 'warning',
          title: 'Wrong Network',
          description: `This contract is deployed on ${targetChainName}. Please switch networks.`
        });
        
        const connector = connectors.find(c => c.id === 'injected')
        if (connector) {
          try {
            await connectAsync({ 
              connector,
              chainId: info.chainId 
            });
          } catch (error) {
            console.error('Failed to switch network:', error);
          }
        }
      }

      // Load blox contract details from catalog
      const contractType = type || info.type;
      if (!contractType) {
        throw new Error('Contract type not found');
      }

      const bloxDetails = await getContractDetails(contractType);
      if (!bloxDetails) {
        throw new Error(`Unknown Blox type: ${contractType}`);
      }
      setBloxContract(bloxDetails);
    } catch (error) {
      console.error('Error loading contract:', error);
      setError(error instanceof Error ? error.message : 'Failed to load contract details');
      showNotification({
        type: 'error',
        title: 'Loading Failed',
        description: error instanceof Error ? error.message : 'Failed to load contract details'
      });
    } finally {
      setLoading(false);
      setBloxUiLoading(false);
    }
  };

  // Update the useEffect to call the standalone function
  useEffect(() => {
    if (!address || !uiInitialized) return;
    
    loadContractInfo();
    
    const timeoutId = setTimeout(() => {
      if (bloxUiLoading) {
        console.warn('Forced reset of loading state after timeout');
        setBloxUiLoading(false);
      }
    }, 10000);
    
    return () => clearTimeout(timeoutId);
  }, [address, uiInitialized]);

  // Add a separate effect for type changes
  useEffect(() => {
    if (!address || !type || !uiInitialized) return;
    if (bloxContract?.id !== type) {
      loadContractInfo();
    }
  }, [type]);

  // Transform raw transactions to SignedTransaction format
  useEffect(() => {
    if (!transactions) return;
    
    const txArray: SignedTransaction[] = Object.entries(transactions).map(([txId, txData]) => ({
      txId,
      timestamp: txData.timestamp,
      metadata: {
        type: txData.metadata?.type as string || 'unknown',
        action: txData.metadata?.action === 'requestAndApprove' ? 'approve' : txData.metadata?.action as 'approve' | 'cancel' | undefined,
        broadcasted: txData.metadata?.broadcasted as boolean || false,
        status: txData.metadata?.status as 'COMPLETED' | 'PENDING' | undefined
      }
    }));
    
    setSignedTransactions(txArray);
  }, [transactions]);

  // Update the handleDisconnect function
  const handleDisconnect = async () => {
    try {
      await disconnect();
      showNotification({
        type: 'success',
        title: "Disconnected",
        description: "Wallet disconnected successfully",
      });
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      showNotification({
        type: 'error',
        title: "Error",
        description: "Failed to disconnect wallet",
      });
    }
  };

  // Add a function to filter out core operations
  const filterBloxOperations = (operations: TxRecord[]): TxRecord[] => {
    return operations.filter(op => {
      const operationName = getOperationName(op.params.operationType as Hex);
      const coreOperations = [
        'OWNERSHIP_TRANSFER',
        'BROADCASTER_UPDATE',
        'RECOVERY_UPDATE',
        'TIMELOCK_UPDATE'
      ];
      return !coreOperations.includes(operationName);
    });
  };

  // Add a function to handle operation approval
  const handleApproveOperation = async (txId: number) => {
    if (!manager || !contractInfo) return;
    
    try {
      const tx = contractInfo.operationHistory.find((op: TxRecord) => Number(op.txId) === txId);
      if (!tx) throw new Error("Transaction not found");

      const operationType = tx.params.operationType as OperationType;
      await approveOperation(operationType, BigInt(txId));
      
      showNotification({
        type: 'success',
        title: "Success",
        description: "Operation approved successfully",
      });

      await refreshAllData();
    } catch (error) {
      console.error('Failed to approve operation:', error);
      showNotification({
        type: 'error',
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to approve operation',
      });
    }
  };

  // Add a function to handle operation cancellation
  const handleCancelOperation = async (txId: number) => {
    if (!manager || !contractInfo) return;
    
    try {
      const tx = contractInfo.operationHistory.find((op: TxRecord) => Number(op.txId) === txId);
      if (!tx) throw new Error("Transaction not found");

      const operationType = tx.params.operationType as OperationType;
      await cancelOperation(operationType, BigInt(txId));
      
      showNotification({
        type: 'success',
        title: "Success",
        description: "Operation cancelled successfully",
      });

      await refreshAllData();
    } catch (error) {
      console.error('Failed to cancel operation:', error);
      showNotification({
        type: 'error',
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to cancel operation',
      });
    }
  };

  // Add this effect to fetch balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (!address || !publicClient || !walletClient || !chain) return;

      try {
        // Get the contract instance based on type
        const contract = await getContractInstance(type, address as `0x${string}`, publicClient, walletClient, chain);
        if (!contract) return;

        // Fetch balances using the contract's interface
        const balances = await contract.getBalances?.();
        if (balances) {
          setTokenBalances(balances);
        }

        // Fetch token balances for tracked tokens
        const trackedTokens = Object.keys(tokenBalances);
        for (const tokenAddress of trackedTokens) {
          try {
            const balance = await contract.getTokenBalance?.(tokenAddress as `0x${string}`);
            const metadata = await contract.getTokenMetadata?.(tokenAddress as `0x${string}`);
            
            if (balance !== undefined) {
              setTokenBalances(prev => ({
                ...prev,
                [tokenAddress]: {
                  balance,
                  metadata,
                  loading: false,
                  error: undefined
                }
              }));
            }
          } catch (error) {
            console.error(`Error fetching token balance for ${tokenAddress}:`, error);
            setTokenBalances(prev => ({
              ...prev,
              [tokenAddress]: {
                ...prev[tokenAddress],
                loading: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching balances:', error);
      }
    };

    fetchBalances();
  }, [address, publicClient, walletClient, chain, type]);

  // Helper function to get contract instance
  const getContractInstance = async (
    type: string | undefined,
    address: `0x${string}`,
    publicClient: PublicClient,
    walletClient: WalletClient,
    chain: Chain
  ) => {
    if (!type) return null;

    try {
      // Load the contract module using the catalog helper
      const contractModule = await loadBloxContractModule(type);
      const ContractClass = contractModule.default;
      
      if (ContractClass) {
        return new ContractClass(publicClient, walletClient, address, chain);
      }
    } catch (error) {
      console.error(`Failed to load contract instance for type ${type}:`, error);
    }
    
    return null;
  };

  // Render the appropriate Blox UI based on type
  const renderBloxUI = () => {
    if (bloxUiLoading) {
      return (
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">Loading BloxUI component...</p>
        </div>
      );
    }

    const secureContractInfo = contractInfo as SecureContractInfo;
    if (!secureContractInfo || !bloxContract || !address) {
      return (
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">No contract information available</p>
        </div>
      );
    }

    // Get the UI component based on the contract type
    const BloxUIComponent = getUIComponent(bloxContract.id);
    if (!BloxUIComponent) {
      return (
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">No UI component found for this contract type</p>
        </div>
      );
    }

    const contractUIInfo = {
      address: address as `0x${string}`,
      type: bloxContract.id,
      name: bloxContract.name,
      category: bloxContract.category,
      description: bloxContract.description,
      bloxId: bloxContract.id,
      chainId: Number(secureContractInfo.chainId),
      chainName: secureContractInfo.chainName
    } satisfies BloxUIProps['contractInfo'];

    return (
      <BloxUIComponent
        contractAddress={address as `0x${string}`}
        contractInfo={contractUIInfo}
        onError={(error: Error) => {
          showNotification({
            type: 'error',
            title: 'Error',
            description: error.message
          });
        }}
      />
    );
  };

  // Optimize loading by separating UI component loading from data loading
  useEffect(() => {
    // Set loading to false once we have contract info, even if BloxUI is still loading
    if (contractInfo && loading) {
      // Use a short timeout to ensure tables render quickly
      setTimeout(() => setLoading(false), 100);
    }
  }, [contractInfo, loading]);

  // Modify the chain ID warning effect to prevent repeated warnings
  useEffect(() => {
    if (!contractInfo || !chainId) return;
    
    // Only show warning if chain changes after initial load
    if (chainId !== contractInfo.chainId) {
      const targetChain = config.chains.find(c => c.id === contractInfo.chainId);
      showNotification({
        type: 'warning',
        title: 'Wrong Network',
        description: `This contract is deployed on ${targetChain?.name || 'Unknown Network'}. Please switch networks.`
      });
    }
  }, [chainId, contractInfo?.chainId]);

  // Add a useEffect to listen for local storage changes
  useEffect(() => {
    // Define a handler for storage events
    const handleStorageChange = (event: StorageEvent) => {
      // Check if the change is related to our transactions
      if (event.key && event.key.includes('transactions')) {
        console.log('Storage changed for transactions, refreshing transaction data');
        
        if (address) {
          // Only update the specific transactions for this contract
          const txManager = new MetaTransactionManager();
          const latestTxs = txManager.getSignedTransactionsByContract(address);
          
          // Convert to array format with proper typing
          const txArray = Object.entries(latestTxs).map(([txId, txData]) => ({
            txId,
            signedData: (txData as StoredTransaction).signedData,
            timestamp: (txData as StoredTransaction).timestamp,
            metadata: (txData as StoredTransaction).metadata as SignedTransaction['metadata']
          }));
          
          // Update the state with the latest transactions
          setSignedTransactions(txArray);
        }
      }
    };

    // Add event listener for storage events
    window.addEventListener('storage', handleStorageChange);
    
    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [address]);

  // Add a function to force refresh transaction data from local storage
  const refreshLocalTransactions = () => {
    if (!address) return;
    
    const txManager = new MetaTransactionManager();
    const latestTxs = txManager.getSignedTransactionsByContract(address);
    
    // Convert to array format with proper typing
    const txArray = Object.entries(latestTxs).map(([txId, txData]) => ({
      txId,
      signedData: (txData as StoredTransaction).signedData,
      timestamp: (txData as StoredTransaction).timestamp,
      metadata: (txData as StoredTransaction).metadata as SignedTransaction['metadata']
    }));
    
    setSignedTransactions(txArray);
  };

  // Add handler for transaction click
  const handleTransactionClick = (transaction: ExtendedSignedTransaction) => {
    setSelectedTransaction(transaction);
    setIsDialogOpen(true);
  };

  return (
    <div className="container py-8">
      <motion.div variants={container} initial="hidden" animate="show">
        {/* Header */}
        <motion.div variants={item} className="flex flex-col gap-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[64px] z-40 w-full">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start lg:items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/dashboard')}
                className="mr-4 hidden lg:flex"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="space-y-3 lg:space-y-2">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/dashboard')}
                    className="lg:hidden h-8 w-8 p-0"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                    {bloxContract?.name || 'Blox Mini App'}
                  </h1>
                </div>
              </div>
            </div>
            {connectedAddress && (
              <WalletStatusBadge
                connectedAddress={connectedAddress}
                contractInfo={contractInfo as SecureContractInfo}
                onDisconnect={handleDisconnect}
              />
            )}
          </div>
        </motion.div>
      
        {/* Contract Info & Security Settings */}
        <motion.div variants={item} className="mt-6">
          <ContractInfo 
            address={address} 
            contractInfo={contractInfo as SecureContractInfo} 
            connectedAddress={connectedAddress}
            navigationIcon={<Shield className="h-4 w-4" />}
            navigationTooltip="Security Settings"
            navigateTo={`/blox-security/${address}`}
          />
        </motion.div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col md:flex-row mt-6">
          {/* Collapse/Expand Button for Mobile */}
          {isMobileView && (
            <Button
              variant="outline"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="mb-4 w-full flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Blox Info
              </span>
              {isSidebarOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Sidebar */}
          <Card 
            className={`
              transition-all duration-300
              ${isMobileView 
                ? `w-full ${isSidebarOpen 
                    ? 'max-h-[500px] mb-4' 
                    : 'max-h-0 overflow-hidden opacity-0 m-0 p-0'}`
                : `border-r rounded-lg shadow-lg ${isSidebarOpen 
                    ? 'w-80 m-4' 
                    : 'w-0 opacity-0 m-0 p-0'}`
              }
            `}
          >
            <div className={`h-full ${!isSidebarOpen ? 'hidden' : ''}`}>
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Blox Info</h2>
                {!isMobileView && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarOpen(false)}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[calc(100%-3rem)] p-4">
                {!loading && !error && bloxContract && address && (
                  <Suspense fallback={
                    <div className="flex items-center justify-center py-4">
                      <p className="text-sm text-muted-foreground">Loading sidebar...</p>
                    </div>
                  }>
                    <SidebarContent 
                      bloxContract={bloxContract}
                      address={address}
                      contractInfo={contractInfo}
                    />
                  </Suspense>
                )}
              </ScrollArea>
            </div>
          </Card>

          {/* Main Workspace */}
          <div className="flex-1 pl-0">
            {!isMobileView && !isSidebarOpen && (
              <Button
                variant="outline"
                onClick={() => setIsSidebarOpen(true)}
                className="mb-4 ml-4 flex items-center gap-2"
              >
                <ChevronRight className="h-4 w-4" />
                <span>Show Blox Info</span>
              </Button>
            )}
            
            <div className="grid grid-cols-1 gap-4">
              {/* Render BloxUI separately with its own loading state */}
              <div className="relative">
                {renderBloxUI()}
              </div>
              
              {/* Signed Meta Transactions */}
              {contractInfo && signedTransactions.length > 0 && (
                <motion.div variants={item} className="mt-6">
                  <SignedMetaTxTable
                    transactions={signedTransactions.filter(tx => {
                      const coreOperations = [
                        'OWNERSHIP_TRANSFER',
                        'BROADCASTER_UPDATE',
                        'RECOVERY_UPDATE',
                        'TIMELOCK_UPDATE'
                      ];
                      return !coreOperations.includes(tx.metadata?.type || '');
                    }) as unknown as ExtendedSignedTransaction[]}
                    onClearAll={clearTransactions}
                    onRemoveTransaction={removeTransaction}
                    contractAddress={address as `0x${string}`}
                    onTxClick={handleTransactionClick}
                  />
                </motion.div>
              )}

              {/* Operations History */}
              {contractInfo && (
                <motion.div variants={item} className="mt-6">
                  <OpHistory
                    contractAddress={address as `0x${string}`}
                    operations={filterBloxOperations(contractInfo.operationHistory)}
                    isLoading={loading}
                    contractInfo={{
                      ...contractInfo,
                      bloxId: type || '',
                      chainId: contractInfo.chainId,
                      chainName: contractInfo.chainName,
                      broadcaster: contractInfo.broadcaster as `0x${string}`,
                      owner: contractInfo.owner as `0x${string}`,
                      recoveryAddress: contractInfo.recoveryAddress as `0x${string}`,
                      timeLockPeriodInMinutes: contractInfo.timeLockPeriodInMinutes
                    }}
                    signedTransactions={signedTransactions}
                    onApprove={handleApproveOperation}
                    onCancel={handleCancelOperation}
                    showMetaTxOption={true}
                    refreshData={refreshAllData}
                    refreshSignedTransactions={refreshLocalTransactions}
                    onNotification={(notification) => {
                      showNotification({
                        type: notification.type as 'error' | 'warning' | 'info' | 'success',
                        title: notification.title,
                        description: notification.description
                      });
                    }}
                  />
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Add the dialog component */}
      {selectedTransaction && (
        <BloxBroadcastDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title={`Broadcast ${selectedTransaction.metadata?.type || 'Operation'}`}
          description={`Broadcast the pending ${selectedTransaction.metadata?.type || 'operation'} transaction to the blockchain.`}
          contractInfo={{
            chainId: contractInfo?.chainId || 0,
            chainName: contractInfo?.chainName || '',
            broadcaster: contractInfo?.broadcaster as string || '',
            owner: contractInfo?.owner as string || '',
            contractAddress: address,
            ...contractInfo
          }}
          transaction={selectedTransaction}
          isLoading={loading}
          connectedAddress={connectedAddress}
          requiredRole="broadcaster"
        />
      )}
    </div>
  );
};

export default BloxMiniApp; 