import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Radio, Network, ArrowUpRight, InfoIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { TxInfoCard } from "./TxInfoCard"
import { useState, useEffect } from "react"
import { formatAddress } from "@/lib/utils"
import { TxStatus } from '@/particle-core/sdk/typescript/types/lib.index'
import { Address, Hex, keccak256 } from "viem"
import { ExtendedSignedTransaction } from "./SignedMetaTxTable"
import { useBloxOperations } from "@/hooks/useBloxOperations"
import { useOperationRegistry } from "@/hooks/useOperationRegistry"
import { TxRecord } from "@/particle-core/sdk/typescript/interfaces/lib.index"
import { useMetaTransactionManager } from "@/hooks/useMetaTransactionManager"

interface BloxBroadcastDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  contractInfo: {
    chainId: number
    chainName: string
    broadcaster: string
    owner: string
    contractAddress?: string
    bloxId?: string
    [key: string]: any
  }
  transaction: ExtendedSignedTransaction
  isLoading?: boolean
  connectedAddress?: string
  requiredRole?: 'broadcaster'
}

export function BloxBroadcastDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  contractInfo,
  transaction,
  isLoading = false,
  connectedAddress,
  requiredRole = 'broadcaster'
}: BloxBroadcastDialogProps) {
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [hasBroadcasted, setHasBroadcasted] = useState(false)
  const [bloxOperations, setBloxOperations] = useState<any>(null)
  const [isLoadingOperations, setIsLoadingOperations] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { getBloxOperations } = useBloxOperations()
  const { getOperationInfo } = useOperationRegistry()
  const { removeTransaction } = useMetaTransactionManager(contractInfo.contractAddress || '')
  
  // Load blox operations when dialog opens
  useEffect(() => {
    const loadOperations = async () => {
      if (!isOpen || !contractInfo.contractAddress) return
      
      setIsLoadingOperations(true)
      setError(null)
      
      try {
        // Get operation type from transaction metadata or compute it from type
        let operationType: Hex | undefined = transaction.metadata?.operationType as Hex
        if (!operationType && transaction.metadata?.type) {
          // Compute operation type hash from the type name
          operationType = ('0x' + keccak256(new TextEncoder().encode(transaction.metadata.type)).slice(2)) as Hex
        }

        console.log('Transaction data:', {
          metadata: transaction.metadata,
          computedOperationType: operationType
        })

        if (!operationType) {
          console.error('Transaction data:', transaction)
          throw new Error('Operation type not found in transaction metadata')
        }

        // Get operation info to determine if this is a blox operation
        const operationInfo = await getOperationInfo(operationType)
        console.log('Operation info:', operationInfo)

        if (!operationInfo?.bloxId) {
          throw new Error('Not a blox operation')
        }

        // Get blox operations using the operation's bloxId
        const operations = await getBloxOperations(operationInfo.bloxId, contractInfo.contractAddress as Address)
        if (!operations) {
          throw new Error('Failed to load blox operations')
        }

        setBloxOperations(operations)
      } catch (error) {
        console.error('Failed to load blox operations:', error)
        setError(error instanceof Error ? error.message : 'Failed to load operations')
      } finally {
        setIsLoadingOperations(false)
      }
    }
    
    loadOperations()
  }, [isOpen, contractInfo.contractAddress, transaction, getOperationInfo, getBloxOperations])
  
  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsBroadcasting(false)
      setHasBroadcasted(false)
      setError(null)
    }
  }, [isOpen])
  
  const isConnectedWalletValid = () => {
    if (!connectedAddress || !contractInfo) return false
    if (requiredRole === 'broadcaster') {
      return connectedAddress.toLowerCase() === contractInfo.broadcaster.toLowerCase()
    }
    return false
  }

  const handleBroadcast = async () => {
    if (!transaction || !contractInfo.contractAddress) return
    
    setIsBroadcasting(true)
    setError(null)
    
    try {
      // Verify wallet connection before proceeding
      if (!isConnectedWalletValid()) {
        throw new Error('Wallet connection lost. Please reconnect and try again.')
      }

      // Get operation type from transaction metadata or compute it from type
      let operationType: Hex | undefined = transaction.metadata?.operationType as Hex
      if (!operationType && transaction.metadata?.type) {
        // Compute operation type hash from the type name
        operationType = ('0x' + keccak256(new TextEncoder().encode(transaction.metadata.type)).slice(2)) as Hex
      }

      console.log('Broadcasting transaction:', {
        metadata: transaction.metadata,
        computedOperationType: operationType
      })

      if (!operationType) {
        console.error('Transaction data:', transaction)
        throw new Error('Operation type not found in transaction metadata')
      }
      
      // Get operation info to determine if this is a blox operation
      const operationInfo = await getOperationInfo(operationType)
      console.log('Operation info:', operationInfo)

      if (!operationInfo?.bloxId) {
        throw new Error('Not a blox operation')
      }

      // Create TxRecord from transaction
      const txRecord: TxRecord = {
        txId: BigInt(transaction.txId),
        message: '0x' as `0x${string}`,
        releaseTime: BigInt(transaction.timestamp),
        status: transaction.metadata?.status === 'COMPLETED' ? TxStatus.COMPLETED : TxStatus.PENDING,
        params: {
          requester: contractInfo.owner as `0x${string}`,
          target: (contractInfo.contractAddress || '0x0') as `0x${string}`,
          value: 0n,
          gasLimit: 0n,
          operationType: operationType,
          executionType: 1, // Standard
          executionOptions: '0x' as `0x${string}`,
        },
        result: '0x' as `0x${string}`,
        payment: {
          recipient: '0x0' as Address,
          nativeTokenAmount: 0n,
          erc20TokenAddress: '0x0' as Address,
          erc20TokenAmount: 0n
        }
      }
      
      // Use blox-specific broadcast handler
      if (!bloxOperations?.handleBroadcast) {
        throw new Error('Blox operations handler not available')
      }

      // Get the action type directly from the transaction metadata
      // This could be any operation type supported by the blox (mint, burn, approve, cancel, etc.)
      const actionType = transaction.metadata?.action
      if (!actionType) {
        throw new Error('Action type not found in transaction metadata')
      }
      
      // Verify wallet connection again before broadcast
      if (!isConnectedWalletValid()) {
        throw new Error('Wallet connection lost before broadcast. Please reconnect and try again.')
      }
      
      // Call the blox-specific broadcast handler with the action type from metadata
      await bloxOperations.handleBroadcast(txRecord, actionType)
      
      // Verify wallet connection after broadcast
      if (!isConnectedWalletValid()) {
        throw new Error('Wallet connection lost after broadcast. Please verify the transaction status.')
      }
      
      // Remove the transaction from local storage after successful broadcast
      removeTransaction(transaction.txId.toString())
      
      setHasBroadcasted(true)
      
      // Close the dialog after a short delay
      setTimeout(() => {
        onOpenChange(false)
      }, 1000)
    } catch (error) {
      console.error('Broadcast error:', error)
      // Handle specific wallet connection errors
      if (error instanceof Error) {
        if (error.message.includes('Wallet connection lost')) {
          setError(error.message)
        } else if (error.message.includes('User rejected')) {
          setError('Transaction was rejected by the user')
        } else if (error.message.includes('Session expired')) {
          setError('Wallet session expired. Please reconnect and try again')
        } else if (error.message.includes('insufficient funds')) {
          setError('Insufficient funds for gas. Please ensure your wallet has enough ETH.')
        } else if (error.message.includes('gas required exceeds allowance')) {
          setError('Transaction requires more gas than allowed. Please try again with higher gas limit.')
        } else if (error.message.includes('Invalid handler selector')) {
          setError('Invalid operation type. Please check the transaction metadata.')
        } else {
          setError(error.message)
        }
      } else {
        setError('Failed to broadcast transaction')
      }
      throw error // Re-throw to let parent component handle it
    } finally {
      setIsBroadcasting(false)
    }
  }

  // Get operation name for display
  const getOperationName = () => {
    if (transaction.metadata?.type) {
      return transaction.metadata.type.replace(/_/g, ' ').toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }
    return 'Operation'
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4 border-b mb-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <DialogTitle>{title}</DialogTitle>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Badge 
                        variant="secondary" 
                        className="flex items-center gap-1 cursor-help hover:bg-secondary/80"
                      >
                        <Network className="h-3 w-3" />
                        <span>Broadcast</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="top" 
                      align="end"
                      className="max-w-[200px] text-xs bg-popover/95 backdrop-blur-sm"
                    >
                      Submit signed transaction to the blockchain
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <DialogDescription>
              {description || `Broadcast the pending ${getOperationName()} transaction to the blockchain.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="flex flex-col gap-1">
                  <span>{error}</span>
                  {error.includes('Operation type not found') && (
                    <span className="text-xs text-muted-foreground">
                      Transaction data: {JSON.stringify({
                        metadata: transaction.metadata
                      }, null, 2)}
                    </span>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {transaction ? (
            <>
              {/* Display transaction info */}
              <TxInfoCard 
                record={{
                  txId: BigInt(transaction.txId),
                  message: '0x' as `0x${string}`,
                  releaseTime: BigInt(transaction.timestamp),
                  status: transaction.metadata?.status === 'COMPLETED' ? TxStatus.COMPLETED : TxStatus.PENDING,
                  params: {
                    requester: contractInfo.owner as `0x${string}`,
                    target: (contractInfo.contractAddress || '0x0') as `0x${string}`,
                    value: 0n,
                    gasLimit: 0n,
                    operationType: transaction.metadata?.operationType || '0x0',
                    executionType: 1,
                    executionOptions: '0x' as `0x${string}`,
                  },
                  result: '0x' as `0x${string}`,
                  payment: {
                    recipient: '0x0' as Address,
                    nativeTokenAmount: 0n,
                    erc20TokenAddress: '0x0' as Address,
                    erc20TokenAmount: 0n
                  }
                }}
                operationName={getOperationName()}
                showExecutionType={true}
                showStatus={true}
              />

              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                      <InfoIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        This transaction has been signed and needs to be broadcasted to the network.
                      </span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span>Broadcaster Address</span>
                      <span className="text-muted-foreground">{formatAddress(contractInfo.broadcaster)}</span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span>Action Type</span>
                      <Badge variant={transaction.metadata?.action === 'approve' ? 'default' : 'destructive'} className="capitalize">
                        {transaction.metadata?.action || 'Unknown'}
                      </Badge>
                    </div>

                    {!isConnectedWalletValid() && (
                      <Alert variant="destructive">
                        <AlertDescription>
                          Please connect the {requiredRole} wallet to proceed
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button 
                      onClick={handleBroadcast}
                      disabled={!transaction || isLoading || isBroadcasting || hasBroadcasted || !isConnectedWalletValid() || isLoadingOperations || !bloxOperations?.handleBroadcast}
                      className="w-full"
                    >
                      {isLoadingOperations ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading Operations...
                        </>
                      ) : isBroadcasting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Broadcasting...
                        </>
                      ) : hasBroadcasted ? (
                        <>
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          Already Broadcasted
                        </>
                      ) : (
                        <>
                          <Radio className="mr-2 h-4 w-4" />
                          Broadcast Transaction
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="p-4 text-center">
              <p className="text-muted-foreground">No pending transaction found to broadcast.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 