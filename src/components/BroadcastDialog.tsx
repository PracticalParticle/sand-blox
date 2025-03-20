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
import { TxRecord } from "../particle-core/sdk/typescript/interfaces/lib.index"
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
  txType: 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE' | 'RECOVERY_UPDATE' | 'RECOVERY_ADDRESS_UPDATE' | 'TIMELOCK_UPDATE'
  onBroadcast: (type: 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE' | 'RECOVERY_UPDATE' | 'RECOVERY_ADDRESS_UPDATE' | 'TIMELOCK_UPDATE') => Promise<void>
  pendingTx?: {
    txId: string
    signedData: string
    timestamp: number
    metadata?: {
      type: 'RECOVERY_UPDATE' | 'TIMELOCK_UPDATE' | 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE'
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
      await onBroadcast(broadcastType as 'OWNERSHIP_TRANSFER' | 'BROADCASTER_UPDATE' | 'RECOVERY_UPDATE' | 'RECOVERY_ADDRESS_UPDATE' | 'TIMELOCK_UPDATE')
      
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
      default: return txType
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{title}</DialogTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Network className="h-3 w-3" />
                    <span>Broadcast</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Submit signed transaction to the blockchain</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <DialogDescription>
            {description || `Broadcast the pending ${getOperationLabel()} transaction to the blockchain.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {pendingTx ? (
            <>
              {/* Display transaction info */}
              <TxInfoCard 
                record={{
                  txId: BigInt(pendingTx.txId),
                  // These are placeholders. The actual TxRecord would have more fields
                  // but we're using what we have in the pendingTx
                  releaseTime: BigInt(pendingTx.timestamp),
                  status: pendingTx.metadata?.status === 'COMPLETED' ? TxStatus.COMPLETED : TxStatus.PENDING,
                  params: {
                    requester: '0x0' as `0x${string}`,
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
                        This transaction has been signed by the {pendingTx.metadata?.action === 'approve' ? 'owner' : 'recovery'} 
                        and needs to be broadcasted to the network.
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