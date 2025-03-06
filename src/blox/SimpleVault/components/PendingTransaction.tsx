import * as React from "react";
import { Address, Hex } from "viem";
import { formatEther, formatUnits } from "viem";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, X, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { TxStatus, ExecutionType } from "../../../particle-core/sdk/typescript/types/lib.index";
import { useMultiPhaseTemporalAction } from "@/hooks/useMultiPhaseTemporalAction";
import { TxRecord } from "../../../particle-core/sdk/typescript/interfaces/lib.index";

// Notification message type
type NotificationMessage = {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
};

// Valid operation types for SimpleVault
const VALID_OPERATIONS = {
  WITHDRAW_ETH: "WITHDRAW_ETH",
  WITHDRAW_TOKEN: "WITHDRAW_TOKEN"
} as const;

type ValidOperationType = typeof VALID_OPERATIONS[keyof typeof VALID_OPERATIONS];

export interface VaultTxRecord extends Omit<TxRecord, 'status'> {
  status: TxStatus;
  amount: bigint;
  to: Address;
  token?: Address;
  type: "ETH" | "TOKEN";
  operationType?: ValidOperationType;
}

interface PendingTransactionProps {
  tx: VaultTxRecord;
  onApprove: (txId: number) => Promise<void>;
  onCancel: (txId: number) => Promise<void>;
  isLoading: boolean;
  contractAddress: Address;
}

export const PendingTransaction: React.FC<PendingTransactionProps> = ({
  tx,
  onApprove,
  onCancel,
  isLoading,
  contractAddress
}) => {
  // Check if the transaction is a valid vault operation
  const isValidVaultOperation = tx.operationType && 
    Object.values(VALID_OPERATIONS).includes(tx.operationType as ValidOperationType);

  // If not a valid vault operation, don't render anything
  if (!isValidVaultOperation) {
    return null;
  }

  const {
    isApproving,
    isCancelling,
    isSigning,
    signedMetaTx,
    handleApprove: handleApproveAction,
    handleCancel: handleCancelAction,
    handleMetaTxSign,
    handleBroadcast
  } = useMultiPhaseTemporalAction({
    isOpen: true,
    onOpenChange: () => {},
    onApprove,
    onCancel,
    pendingTx: { ...tx, contractAddress },
    showNewValueInput: false
  });

  try {
    const now = Math.floor(Date.now() / 1000);
    const isReady = now >= Number(tx.releaseTime);
    const progress = Math.min(((now - (Number(tx.releaseTime) - 24 * 3600)) / (24 * 3600)) * 100, 100);
    const isTimeLockComplete = progress >= 100;

    // Ensure amount is a BigInt and handle undefined
    const amount = tx.amount !== undefined ? BigInt(tx.amount) : 0n;

    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-left">
                <div className="flex items-center gap-2">
                  {tx.status === TxStatus.PENDING && <Clock className="h-4 w-4 text-yellow-500" />}
                  {tx.status === TxStatus.CANCELLED && <XCircle className="h-4 w-4 text-red-500" />}
                  {tx.status === TxStatus.COMPLETED && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  <p className="font-medium">
                    {tx.operationType === VALID_OPERATIONS.WITHDRAW_ETH ? "ETH Withdrawal" : "Token Withdrawal"} #{tx.txId.toString()}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Amount: {tx.type === "ETH" ? formatEther(amount) : formatUnits(amount, 18)} {tx.type}
                </p>
                <p className="text-sm text-muted-foreground">To: {tx.to}</p>
                {tx.type === "TOKEN" && tx.token && (
                  <p className="text-sm text-muted-foreground">Token: {tx.token}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
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
            </div>

            <div className="flex space-x-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1">
                      <Button
                        onClick={() => handleApproveAction(Number(tx.txId))}
                        disabled={!isReady || isLoading || tx.status !== TxStatus.PENDING || !isTimeLockComplete || isApproving || isSigning}
                        className={`w-full transition-all duration-200 flex items-center justify-center
                          ${isTimeLockComplete 
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                          }
                          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:dark:bg-slate-900 disabled:dark:text-slate-500
                        `}
                        variant="outline"
                        aria-label={`Approve transaction #${tx.txId}`}
                      >
                        {isApproving || isSigning ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            <span>{isSigning ? "Signing..." : "Processing..."}</span>
                          </>
                        ) : (
                          <>
                            {isTimeLockComplete && <CheckCircle2 className="h-4 w-4 mr-2" />}
                            <span>Approve</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {!isTimeLockComplete 
                      ? "Time lock period not complete" 
                      : isReady 
                        ? "Approve this withdrawal request" 
                        : "Not yet ready for approval"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1">
                      <Button
                        onClick={() => handleCancelAction(Number(tx.txId))}
                        disabled={isLoading || tx.status !== TxStatus.PENDING || isCancelling}
                        className={`w-full transition-all duration-200 flex items-center justify-center
                          bg-rose-50 text-rose-700 hover:bg-rose-100 
                          dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50
                          border border-rose-200 dark:border-rose-800
                          disabled:opacity-50 disabled:cursor-not-allowed 
                          disabled:bg-slate-50 disabled:text-slate-400 
                          disabled:dark:bg-slate-900 disabled:dark:text-slate-500"
                        `}
                        variant="outline"
                        aria-label={`Cancel transaction #${tx.txId}`}
                      >
                        {isCancelling ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <X className="h-4 w-4 mr-2" />
                            <span>Cancel</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {tx.status !== TxStatus.PENDING 
                      ? "This transaction cannot be cancelled" 
                      : "Cancel this withdrawal request"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  } catch (error) {
    console.error("Error rendering pending transaction:", error);
    return <div>Error rendering transaction details.</div>;
  }
}; 