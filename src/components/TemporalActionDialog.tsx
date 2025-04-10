import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, X, CheckCircle2, Clock, Shield, Wallet } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { TxRecord } from "../particle-core/sdk/typescript/interfaces/lib.index"
import { formatAddress } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { useMultiPhaseTemporalAction } from "@/hooks/useMultiPhaseTemporalAction"
import { useState, useEffect } from "react"
import { TxInfoCard } from "./TxInfoCard"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface TemporalActionDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  contractInfo: {
    contractAddress: string
    timeLockPeriodInMinutes: number
    chainId: number
    chainName: string
    broadcaster: string
    owner: string
    recoveryAddress: string
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
  showMetaTxOption?: boolean
  metaTxDescription?: string
  operationName?: string
  refreshData?: () => void
  refreshSignedTransactions?: () => void
}

export function TemporalActionDialog({
  isOpen,
  onOpenChange,
  title,
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
  newValuePlaceholder,
  showMetaTxOption,
  metaTxDescription,
  operationName,
  refreshData,
  refreshSignedTransactions
}: TemporalActionDialogProps): JSX.Element {
  const {
    newValue,
    isApproving,
    isCancelling,
    isSigning,
    setNewValue,
    handleSubmit,
    handleApprove,
    handleCancel,
    handleMetaTxSign
  } = useMultiPhaseTemporalAction({
    isOpen,
    onOpenChange,
    onSubmit,
    onApprove,
    onCancel,
    pendingTx: pendingTx ? { 
      ...pendingTx, 
      contractAddress: contractInfo.contractAddress as `0x${string}`,
      timeLockPeriodInMinutes: contractInfo.timeLockPeriodInMinutes 
    } : undefined,
    showNewValueInput,
    onMetaTxSignSuccess: refreshData,
    refreshSignedTransactions
  })

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

    const [currentProgress, setCurrentProgress] = useState(0)
    const [isTimeLockComplete, setIsTimeLockComplete] = useState(false)

    useEffect(() => {
      const calculateProgress = () => {
        const now = Math.floor(Date.now() / 1000)
        const releaseTime = Number(pendingTx.releaseTime)
        const timeLockPeriod = (contractInfo.timeLockPeriodInMinutes || 0) * 60
        const startTime = releaseTime - timeLockPeriod
        const progress = Math.min(((now - startTime) / timeLockPeriod) * 100, 100)
        setCurrentProgress(progress)
        setIsTimeLockComplete(progress >= 100)
      }

      // Calculate initial progress
      calculateProgress()

      // Update progress every second
      const intervalId = setInterval(calculateProgress, 1000)

      // Cleanup interval on unmount
      return () => clearInterval(intervalId)
    }, [pendingTx.releaseTime, contractInfo.timeLockPeriodInMinutes])

    // Check if the connected wallet is recovery address for ownership actions
    const isRecoveryWallet = connectedAddress?.toLowerCase() === contractInfo?.recoveryAddress?.toLowerCase()
    const isOwnerWallet = connectedAddress?.toLowerCase() === contractInfo?.owner?.toLowerCase()
    const isOwnershipAction = actionType === 'ownership'
    
    // Control meta transaction tab visibility with showMetaTxOption prop if provided
    const showMetaTxTab = showMetaTxOption !== undefined ? showMetaTxOption : !(isOwnershipAction && isRecoveryWallet)

    // Determine the required role message based on action type and timelock status
    const getRequiredRoleMessage = () => {
      if (isOwnershipAction && isTimeLockComplete) {
        return "Please connect the owner or recovery wallet to proceed";
      } else if (isOwnershipAction) {
        return "Please connect the owner wallet to proceed";
      } else if (requiredRole === 'broadcaster') {
        return "Please connect the broadcaster wallet to proceed";
      } else if (requiredRole === 'recovery') {
        return "Please connect the recovery wallet to proceed";
      } else {
        return `Please connect the ${requiredRole} wallet to proceed`;
      }
    };

    // Check if the wallet is valid for the current action phase
    const isWalletValidForAction = () => {
      if (isOwnershipAction && isTimeLockComplete) {
        // When timelock is 100% for ownership transfer, either owner or recovery is valid
        return isOwnerWallet || isRecoveryWallet;
      }
      return isConnectedWalletValid;
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Transaction #{pendingTx.txId.toString()}
        </div>

        {!isWalletValidForAction() && (
          <Alert variant="destructive">
            <AlertDescription>
              {getRequiredRoleMessage()}
            </AlertDescription>
          </Alert>
        )}

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
                    <span>{Math.round(currentProgress)}%</span>
                  </div>
                  <Progress 
                    value={currentProgress} 
                    className={`h-2 ${isTimeLockComplete ? 'bg-muted' : ''}`}
                    aria-label="Time lock progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(currentProgress)}
                  />

                  <div className="flex space-x-2">
                    <TooltipProvider>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <div className="w-full">
                            <Button
                              onClick={() => handleApprove(Number(pendingTx.txId))}
                              disabled={isLoading || isApproving || !isWalletValidForAction() || (!isTimeLockComplete && isRecoveryWallet)}
                              className={cn(
                                "w-full transition-all duration-200 flex items-center justify-center",
                                isTimeLockComplete 
                                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800"
                                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700",
                                "hover:opacity-90"
                              )}
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
                        <TooltipContent 
                          side="bottom" 
                          align="center"
                          sideOffset={4}
                          className="max-w-[200px] text-xs bg-popover/95 backdrop-blur-sm"
                        >
                          {!isWalletValidForAction()
                            ? getRequiredRoleMessage()
                            : !isTimeLockComplete
                              ? "Time lock period not complete"
                              : "Approve this request using the timelock mechanism"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <div className="w-full">
                            <Button
                              onClick={() => handleCancel(Number(pendingTx.txId))}
                              disabled={isLoading || isCancelling || !isWalletValidForAction()}
                              className={cn(
                                "w-full transition-all duration-200 flex items-center justify-center",
                                "bg-rose-50 text-rose-700 hover:bg-rose-100",
                                "dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50",
                                "border border-rose-200 dark:border-rose-800",
                                "hover:opacity-90"
                              )}
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
                        <TooltipContent 
                          side="bottom" 
                          align="center"
                          sideOffset={4}
                          className="max-w-[200px] text-xs bg-popover/95 backdrop-blur-sm"
                        >
                          {!isWalletValidForAction()
                            ? getRequiredRoleMessage()
                            : "Cancel this request"}
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
                      {metaTxDescription || "Sign a meta transaction that will be broadcasted by the broadcaster wallet. This doesn't require gas fees."}
                    </div>

                    <div className="flex justify-between text-sm">
                      <span>Broadcaster Required</span>
                      <span className="text-muted-foreground">{formatAddress(contractInfo.broadcaster)}</span>
                    </div>

                    <div className="flex space-x-2">
                      <TooltipProvider>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <div className="flex-1">
                              <Button
                                onClick={() => handleMetaTxSign('approve', actionType === 'broadcaster' ? 'broadcaster' : 'ownership')}
                                disabled={isLoading || isSigning || !isWalletValidForAction()}
                                className={cn(
                                  "w-full transition-all duration-200 flex items-center justify-center",
                                  "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                                  "dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50",
                                  "border border-emerald-200 dark:border-emerald-800"
                                )}
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
                                    Sign Approval
                                  </>
                                )}
                              </Button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent 
                            side="bottom" 
                            align="center"
                            className="max-w-[200px]"
                          >
                            Approve this request using meta-transactions (delegated)
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <div className="flex-1">
                              <Button
                                onClick={() => handleMetaTxSign('cancel', actionType === 'broadcaster' ? 'broadcaster' : 'ownership')}
                                disabled={isLoading || isCancelling || !isWalletValidForAction()}
                                className={cn(
                                  "w-full transition-all duration-200 flex items-center justify-center",
                                  "bg-rose-50 text-rose-700 hover:bg-rose-100",
                                  "dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50",
                                  "border border-rose-200 dark:border-rose-800"
                                )}
                                variant="outline"
                              >
                                {isSigning ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing...
                                  </>
                                ) : (
                                  <>
                                    <X className="mr-2 h-4 w-4" />
                                    Sign Cancel
                                  </>
                                )}
                              </Button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent 
                            side="bottom" 
                            align="center"
                            className="max-w-[200px]"
                          >
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
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4 border-b mb-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <DialogTitle>{title}</DialogTitle>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className="flex items-center gap-1"
                >
                  <Clock className="h-3 w-3" />
                  <span>Time Lock</span>
                </Badge>
              </div>
            </div>
            <DialogDescription>
              {pendingTx ? (
                <>Review and approve the pending {actionType} change request.</>
              ) : (
                <>Submit a new {actionType} change request. This will require approval after the timelock period.</>
              )}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Display TxInfoCard when a pending transaction exists */}
          {pendingTx && (
            <TxInfoCard 
              record={pendingTx}
              operationName={operationName || actionType}
              showExecutionType={true}
              showStatus={true}
            />
          )}
          
          {pendingTx ? renderApprovalPhase() : renderRequestPhase()}
        </div>
      </DialogContent>
    </Dialog>
  )
} 