import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Radio, Network, ArrowUpRight, InfoIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { TxInfoCard } from "./TxInfoCard"
import { useState } from "react"
import { formatAddress } from "@/lib/utils"
import { TxStatus } from "../particle-core/sdk/typescript/types/lib.index"
import { Address } from "viem"

interface BroadcastDialogProps {
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
    [key: string]: any
  }
  txType: 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE' | 'RECOVERY_UPDATE' | 'RECOVERY_ADDRESS_UPDATE' | 'TIMELOCK_UPDATE' | 'WITHDRAWAL_APPROVAL'
  onBroadcast: (type: 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE' | 'RECOVERY_UPDATE' | 'RECOVERY_ADDRESS_UPDATE' | 'TIMELOCK_UPDATE' | 'WITHDRAWAL_APPROVAL') => Promise<void>
  pendingTx?: {
    txId: string
    signedData: string
    timestamp: number
    metadata?: {
      type: 'RECOVERY_UPDATE' | 'TIMELOCK_UPDATE' | 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE' | 'WITHDRAWAL_APPROVAL'
      purpose?: 'address_update' | 'ownership_transfer'
      action?: 'approve' | 'cancel'
      broadcasted: boolean
      operationType?: `0x${string}`
      status?: 'COMPLETED' | 'PENDING'
    }
  }
  isLoading?: boolean
  operationName?: string
  connectedAddress?: string
}

export function BroadcastDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  contractInfo,
  txType,
  onBroadcast,
  pendingTx,
  isLoading = false,
  operationName,
  connectedAddress
}: BroadcastDialogProps) {
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  
  const isConnectedWalletValid = () => {
    if (!connectedAddress || !contractInfo) return false
    return connectedAddress.toLowerCase() === contractInfo.broadcaster.toLowerCase()
  }

  const handleBroadcast = async () => {
    if (!pendingTx) return
    
    try {
      setIsBroadcasting(true)
      
      // Use the transaction type from the pendingTx metadata if available
      // This ensures we're using the correct type for the transaction
      const actualType = pendingTx.metadata?.type || txType
      
      // Handle special case for RECOVERY_UPDATE with different purposes
      let broadcastType = actualType
      if (actualType === 'RECOVERY_UPDATE' && pendingTx.metadata?.purpose === 'ownership_transfer') {
        broadcastType = 'OWNERSHIP_TRANSFER'
      } else if (actualType === 'RECOVERY_UPDATE' && pendingTx.metadata?.purpose === 'address_update') {
        broadcastType = 'RECOVERY_UPDATE'
      }
      
      // Call the onBroadcast function with the determined transaction type
      await onBroadcast(broadcastType as 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE' | 'RECOVERY_UPDATE' | 'RECOVERY_ADDRESS_UPDATE' | 'TIMELOCK_UPDATE' | 'WITHDRAWAL_APPROVAL')
      
      // The dialog will be closed by the parent component after successful broadcast
    } catch (error) {
      console.error('Broadcast error:', error)
      // Error handling is done in the parent component
    } finally {
      setIsBroadcasting(false)
    }
  }

  // Format the operation type for display
  const getOperationLabel = () => {
    switch (txType) {
      case 'OWNERSHIP_TRANSFER': return 'Ownership Transfer'
      case 'BROADCASTER_UPDATE': return 'Broadcaster Update'
      case 'RECOVERY_UPDATE': return 'Recovery Update'
      case 'RECOVERY_ADDRESS_UPDATE': return 'Recovery Address Update'
      case 'TIMELOCK_UPDATE': return 'Time Lock Update'
      case 'WITHDRAWAL_APPROVAL': return 'Withdrawal Approval'
      default: return txType
    }
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
              {description || `Broadcast the pending ${getOperationLabel()} transaction to the blockchain.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {pendingTx ? (
            <>
              {/* Display transaction info */}
              <TxInfoCard 
                record={{
                  txId: BigInt(pendingTx.txId),
                  message: '0x' as `0x${string}`,
                  // These are placeholders. The actual TxRecord would have more fields
                  // but we're using what we have in the pendingTx
                  releaseTime: BigInt(pendingTx.timestamp),
                  status: pendingTx.metadata?.status === 'COMPLETED' ? TxStatus.COMPLETED : TxStatus.PENDING,
                  params: {
                    requester: contractInfo.owner as `0x${string}`,
                    target: (contractInfo.contractAddress || '0x0') as `0x${string}`,
                    value: 0n,
                    gasLimit: 0n,
                    operationType: pendingTx.metadata?.operationType || '0x0',
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
                }}
                operationName={operationName || getOperationLabel()}
                showExecutionType={true}
                showStatus={true}
              />

              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                      <InfoIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        This transaction has been signed by the Owner and needs to be broadcasted to the network.
                      </span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span>Broadcaster Address</span>
                      <span className="text-muted-foreground">{formatAddress(contractInfo.broadcaster)}</span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span>Action Type</span>
                      <Badge variant={pendingTx.metadata?.action === 'approve' ? 'default' : 'destructive'} className="capitalize">
                        {pendingTx.metadata?.action || 'Unknown'}
                      </Badge>
                    </div>

                    {!isConnectedWalletValid() && (
                      <Alert variant="destructive">
                        <AlertDescription>
                          Please connect the broadcaster wallet to proceed
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button 
                      onClick={handleBroadcast}
                      disabled={!pendingTx || isLoading || isBroadcasting || pendingTx.metadata?.broadcasted || !isConnectedWalletValid()}
                      className="w-full"
                    >
                      {isBroadcasting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Broadcasting...
                        </>
                      ) : pendingTx.metadata?.broadcasted ? (
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