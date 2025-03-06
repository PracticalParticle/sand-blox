import * as React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, X, CheckCircle2, Clock, XCircle, Shield, Wallet } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { TxRecord } from "@/particle-core/sdk/typescript/interfaces/lib.index"
import { TxStatus } from "@/particle-core/sdk/typescript/types/lib.index"
import { formatAddress } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

interface TemporalActionDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  contractInfo: {
    timeLockPeriodInMinutes: number
    chainId: number
    chainName: string
    [key: string]: any
  }
  actionType: string
  currentValue: string
  currentValueLabel: string
  actionLabel: string
  isLoading?: boolean
  onSubmit?: (newValue: string) => Promise<void>
  onApprove?: (txId: number) => Promise<void>
  onCancel?: (txId: number) => Promise<void>
  requiredRole: string
  connectedAddress?: string
  pendingTx?: TxRecord
  showNewValueInput?: boolean
  newValueLabel?: string
  newValuePlaceholder?: string
}

export function TemporalActionDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  contractInfo,
  actionType,
  currentValue,
  currentValueLabel,
  actionLabel,
  isLoading = false,
  onSubmit,
  onApprove,
  onCancel,
  requiredRole,
  connectedAddress,
  pendingTx,
  showNewValueInput = true,
  newValueLabel,
  newValuePlaceholder
}: TemporalActionDialogProps) {
  const [newValue, setNewValue] = useState("")
  const [isApproving, setIsApproving] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const { toast } = useToast()

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setNewValue("")
      setIsApproving(false)
      setIsCancelling(false)
      setIsSigning(false)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onSubmit) return
    if (!showNewValueInput || newValue) {
      try {
        await onSubmit(newValue)
        setNewValue("")
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to submit request",
          variant: "destructive",
        })
      }
    }
  }

  const handleApprove = async (txId: number) => {
    if (!onApprove) return
    setIsApproving(true)
    try {
      await onApprove(txId)
      toast({
        title: "Success",
        description: "Transaction approved successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve transaction",
        variant: "destructive",
      })
    } finally {
      setIsApproving(false)
    }
  }

  const handleCancel = async (txId: number) => {
    if (!onCancel) return
    setIsCancelling(true)
    try {
      await onCancel(txId)
      toast({
        title: "Success",
        description: "Transaction cancelled successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel transaction",
        variant: "destructive",
      })
    } finally {
      setIsCancelling(false)
    }
  }

  const getRoleAddress = (role: string) => {
    if (!contractInfo) return null;
    switch (role) {
      case 'owner':
        return contractInfo.owner;
      case 'broadcaster':
        return contractInfo.broadcaster;
      case 'recovery':
        return contractInfo.recoveryAddress;
      case 'owner_or_recovery':
        // Return true if connected address matches either owner or recovery
        return [contractInfo.owner, contractInfo.recoveryAddress];
      default:
        return null;
    }
  };

  const isConnectedWalletValid = connectedAddress && 
    requiredRole && 
    contractInfo && 
    (() => {
      const roleAddress = getRoleAddress(requiredRole);
      if (Array.isArray(roleAddress)) {
        // For owner_or_recovery role, check if connected address matches either
        return roleAddress.some(addr => 
          addr?.toLowerCase() === connectedAddress.toLowerCase()
        );
      }
      return roleAddress?.toLowerCase() === connectedAddress.toLowerCase();
    })();

  console.log('Wallet Validation:', {
    connectedAddress,
    requiredRole,
    roleAddress: getRoleAddress(requiredRole),
    isValid: isConnectedWalletValid,
    contractInfo
  });

  const renderRequestPhase = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{currentValueLabel}</Label>
          <div className="p-2 bg-muted rounded-lg">
            <code className="text-sm">{currentValue}</code>
          </div>
        </div>

        {showNewValueInput && (
          <div className="space-y-2">
            <Label>{newValueLabel || `New ${actionType} Address`}</Label>
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={newValuePlaceholder || "Enter Ethereum address"}
              disabled={isLoading}
            />
          </div>
        )}

        {!isConnectedWalletValid && (
          <Alert variant="destructive">
            <AlertDescription>
              Please connect the {requiredRole} wallet to proceed
            </AlertDescription>
          </Alert>
        )}

        <Button 
          type="submit" 
          disabled={showNewValueInput ? (!newValue || !isConnectedWalletValid || isLoading) : (!isConnectedWalletValid || isLoading)}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            actionLabel
          )}
        </Button>
      </div>
    </form>
  )

  const renderApprovalPhase = () => {
    if (!pendingTx) return null

    // Calculate time lock progress
    const now = Math.floor(Date.now() / 1000)
    const releaseTime = Number(pendingTx.releaseTime)
    const timeLockPeriod = (contractInfo.timeLockPeriodInMinutes || 0) * 60 // convert minutes to seconds
    const startTime = releaseTime - timeLockPeriod
    const progress = Math.min(((now - startTime) / timeLockPeriod) * 100, 100)
    const isTimeLockComplete = progress >= 100

    // Check if the connected wallet is recovery address for ownership actions
    const isRecoveryWallet = connectedAddress?.toLowerCase() === contractInfo?.recoveryAddress?.toLowerCase()
    const isOwnershipAction = actionType === 'ownership'
    
    // Hide meta transactions tab for recovery wallet in ownership actions
    const showMetaTxTab = !(isOwnershipAction && isRecoveryWallet)

    console.log('Time Lock Debug:', {
      now,
      releaseTime,
      timeLockPeriod,
      startTime,
      progress,
      isTimeLockComplete,
      pendingTx,
      contractInfo,
      isRecoveryWallet,
      isOwnershipAction,
      showMetaTxTab
    })

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Transaction #{pendingTx.txId.toString()}
        </div>

        <Tabs defaultValue="timelock" className={`w-full ${showMetaTxTab ? 'grid-cols-2' : 'grid-cols-1'} bg-background p-1 rounded-lg`}>
          <TabsList className="grid w-full grid-cols-2 bg-background p-1 rounded-lg">
            <TabsTrigger value="timelock" className="rounded-md data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-medium">
              <Shield className="h-4 w-4 mr-2" />
              TimeLock
            </TabsTrigger>
            {showMetaTxTab && (
              <TabsTrigger value="metatx" className="rounded-md data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-medium">
                <Wallet className="h-4 w-4 mr-2" />
                MetaTx
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="timelock" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Approve using the standard timelock mechanism. This requires gas fees.
                  </div>

                  <div className="flex justify-between text-sm">
                    <span>Time Lock Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress 
                    value={progress} 
                    className={`h-2 ${isTimeLockComplete ? 'bg-muted' : ''}`}
                    aria-label="Time lock progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress)}
                  />

                  <div className="flex space-x-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex-1">
                            <Button
                              onClick={() => handleApprove(Number(pendingTx.txId))}
                              disabled={isLoading || isApproving || !isConnectedWalletValid || (!isTimeLockComplete && isRecoveryWallet)}
                              className={`w-full transition-all duration-200 flex items-center justify-center
                                ${isTimeLockComplete 
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                                }
                                disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:dark:bg-slate-900 disabled:dark:text-slate-500
                              `}
                              variant="outline"
                            >
                              {isApproving ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  {isTimeLockComplete && <CheckCircle2 className="mr-2 h-4 w-4" />}
                                  Approve
                                </>
                              )}
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {!isTimeLockComplete 
                            ? "Time lock period not complete" 
                            : "Approve this request using the timelock mechanism"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex-1">
                            <Button
                              onClick={() => handleCancel(Number(pendingTx.txId))}
                              disabled={isLoading || isCancelling || !isConnectedWalletValid}
                              className="w-full bg-rose-50 text-rose-700 hover:bg-rose-100 
                                dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50
                                border border-rose-200 dark:border-rose-800"
                              variant="outline"
                            >
                              {isCancelling ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <X className="mr-2 h-4 w-4" />
                                  Cancel
                                </>
                              )}
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          Cancel this request
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {showMetaTxTab && (
            <TabsContent value="metatx" className="space-y-4 mt-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Approve using meta-transactions. This requires no gas fees but needs the broadcaster wallet.
                    </div>

                    <div className="flex justify-between text-sm">
                      <span>Broadcaster Required</span>
                      <span className="text-muted-foreground">{formatAddress(contractInfo.broadcaster)}</span>
                    </div>

                    <div className="flex space-x-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex-1">
                              <Button
                                onClick={() => handleApprove(Number(pendingTx.txId))}
                                disabled={isLoading || isSigning || !isConnectedWalletValid}
                                className={`w-full transition-all duration-200 flex items-center justify-center
                                  bg-emerald-50 text-emerald-700 hover:bg-emerald-100 
                                  dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 
                                  border border-emerald-200 dark:border-emerald-800
                                  disabled:opacity-50 disabled:cursor-not-allowed 
                                  disabled:bg-slate-50 disabled:text-slate-400 
                                  disabled:dark:bg-slate-900 disabled:dark:text-slate-500
                                `}
                                variant="outline"
                              >
                                {isSigning ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Sign & Approve
                                  </>
                                )}
                              </Button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Approve this request using meta-transactions (gasless)
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex-1">
                              <Button
                                onClick={() => handleCancel(Number(pendingTx.txId))}
                                disabled={isLoading || isCancelling || !isConnectedWalletValid}
                                className={`w-full transition-all duration-200 flex items-center justify-center
                                  bg-rose-50 text-rose-700 hover:bg-rose-100 
                                  dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50
                                  border border-rose-200 dark:border-rose-800
                                  disabled:opacity-50 disabled:cursor-not-allowed 
                                  disabled:bg-slate-50 disabled:text-slate-400 
                                  disabled:dark:bg-slate-900 disabled:dark:text-slate-500
                                `}
                                variant="outline"
                              >
                                {isCancelling ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                  </>
                                ) : (
                                  <>
                                    <X className="mr-2 h-4 w-4" />
                                    Cancel
                                  </>
                                )}
                              </Button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Cancel this request
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {pendingTx ? (
              <>Review and approve the pending {actionType} change request.</>
            ) : (
              <>Submit a new {actionType} change request. This will require approval after the timelock period.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {pendingTx ? renderApprovalPhase() : renderRequestPhase()}
        </div>
      </DialogContent>
    </Dialog>
  )
} 