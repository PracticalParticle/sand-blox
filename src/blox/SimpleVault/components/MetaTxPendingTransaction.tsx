import * as React from "react";
import { useState, useEffect } from "react";
import { Address, Hex } from "viem";
import { formatEther, formatUnits } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, X, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MetaTxApprovalDialog } from "./MetaTxApprovalDialog";
import { TxStatus } from "../../../particle-core/sdk/typescript/types/lib.index";
import { useChain } from "@/hooks/useChain";
import SimpleVault from "../SimpleVault";
import { createWalletClient, http } from "viem";
import { MetaTransaction } from "../../../particle-core/sdk/typescript/interfaces/lib.index";
import { useToast } from "@/components/ui/use-toast";
import SecureOwnable from "../../../particle-core/sdk/typescript/SecureOwnable";

// Notification message type
type NotificationMessage = {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
};

export interface VaultTxRecord {
  txId: bigint;
  amount: bigint;
  releaseTime: bigint;
  status: TxStatus;
  type: string;
  params: {
    target: string;
    data?: string;  // Make data optional to be compatible with both types
  };
}

interface ContractSecurityInfo {
  owner: string;
  broadcaster: string;
  recoveryAddress: string;
  timeLockPeriod: bigint;
  chainId: number;
  chainName: string;
}

interface MetaTxPendingTransactionProps {
  tx: VaultTxRecord;
  onCancel: (txId: number) => Promise<void>;
  isLoading: boolean;
  contractAddress: Address;
  addMessage?: (message: NotificationMessage) => void;
  onApprovalSuccess?: () => Promise<void>;
}

export const MetaTxPendingTransaction: React.FC<MetaTxPendingTransactionProps> = ({
  tx,
  onCancel,
  isLoading,
  contractAddress,
  addMessage,
  onApprovalSuccess
}) => {
  const [showBroadcasterDialog, setShowBroadcasterDialog] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signedMetaTx, setSignedMetaTx] = useState<MetaTransaction | null>(null);
  const [contractInfo, setContractInfo] = useState<ContractSecurityInfo | null>(null);
  const chain = useChain();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { toast } = useToast();

  // Fetch contract security info from the contract
  useEffect(() => {
    const fetchContractInfo = async () => {
      if (!publicClient || !chain || !contractAddress) return;

      try {
        const secureOwnable = new SecureOwnable(
          publicClient,
          walletClient || undefined,
          contractAddress,
          chain
        );

        const [owner, broadcaster, recoveryAddress, timeLockPeriod] = await Promise.all([
          secureOwnable.owner(),
          secureOwnable.getBroadcaster(),
          secureOwnable.getRecoveryAddress(),
          secureOwnable.getTimeLockPeriodInMinutes()
        ]);

        setContractInfo({
          owner,
          broadcaster,
          recoveryAddress,
          timeLockPeriod,
          chainId: chain.id,
          chainName: chain.name
        });
      } catch (error) {
        console.error("Error fetching contract security info:", error);
        handleNotification({
          type: 'error',
          title: "Error",
          description: "Failed to fetch contract security information"
        });
      }
    };

    fetchContractInfo();
  }, [publicClient, walletClient, chain, contractAddress]);

  const handleNotification = (message: NotificationMessage) => {
    if (addMessage) {
      addMessage(message);
    } else {
      toast({
        title: message.title,
        description: message.description,
        variant: message.type === 'error' ? 'destructive' : 
                 message.type === 'success' ? 'default' : undefined
      });
    }
  };

  const handleApproveWithMetaTx = async () => {
    if (!tx || !contractInfo || !chain || !publicClient || !walletClient || !address) {
      handleNotification({
        type: 'error',
        title: "Error",
        description: "Missing required dependencies for meta transaction"
      });
      return;
    }
    
    setIsSigning(true);
    
    try {
      // Create vault instance
      const vault = new SimpleVault(
        publicClient,
        walletClient,
        contractAddress,
        chain
      );
      
      // 1. Generate unsigned meta transaction
      const unsignedMetaTx = await vault.generateUnsignedWithdrawalMetaTxApproval(
        tx.txId
      );
      
      // 2. Get the owner to sign the meta transaction
      if (!address) {
        throw new Error("Owner wallet not connected");
      }
      
      handleNotification({
        type: 'info',
        title: "Signing Transaction",
        description: "Please sign the transaction with your wallet"
      });
      
      // Create a typed data signature
      const signature = await walletClient.signTypedData({
        domain: {
          name: 'SimpleVault',
          version: '1',
          chainId: chain.id,
          verifyingContract: contractAddress
        },
        types: {
          MetaTransaction: [
            { name: 'txId', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'signer', type: 'address' }
          ]
        },
        primaryType: 'MetaTransaction',
        message: {
          txId: unsignedMetaTx.txRecord.txId,
          deadline: unsignedMetaTx.params.deadline,
          signer: address
        }
      });
      
      if (!signature) {
        throw new Error("Failed to sign meta transaction");
      }
      
      // 3. Add signature to meta transaction
      const metaTx = {
        ...unsignedMetaTx,
        signature: signature as Hex
      };
      
      // Store the signed meta transaction
      setSignedMetaTx(metaTx);
      
      handleNotification({
        type: 'success',
        title: "Transaction Signed",
        description: "Transaction signed successfully. Please connect your broadcaster wallet to submit it."
      });
      
      // Now show the broadcaster dialog
      setShowBroadcasterDialog(true);
    } catch (error: any) {
      console.error("Meta transaction signing failed:", error);
      handleNotification({
        type: 'error',
        title: "Signing Failed",
        description: error.message || "Failed to sign the meta transaction"
      });
    } finally {
      setIsSigning(false);
    }
  };

  const handleBroadcasterConnected = async (broadcasterAddress: string) => {
    if (!signedMetaTx || !contractInfo || !chain || !publicClient || !walletClient) {
      handleNotification({
        type: 'error',
        title: "Error",
        description: "Missing signed transaction or required dependencies"
      });
      return;
    }

    setIsApproving(true);
    
    try {
      // Ensure the wallet is connected to the correct chain
      const currentChainId = await walletClient.getChainId();
      if (currentChainId !== chain.id) {
        handleNotification({
          type: 'info',
          title: "Switching Network",
          description: `Switching to ${chain.name} (${chain.id})`
        });
        
        try {
          await walletClient.switchChain({ id: chain.id });
        } catch (switchError: any) {
          console.error("Error switching chain:", switchError);
          handleNotification({
            type: 'error',
            title: "Network Switch Failed",
            description: "Please manually switch to the correct network in your wallet."
          });
          return;
        }
      }

      // Ensure the correct account is selected
      const [account] = await walletClient.getAddresses();
      if (!account || account.toLowerCase() !== broadcasterAddress.toLowerCase()) {
        handleNotification({
          type: 'error',
          title: "Account Mismatch",
          description: "Connected wallet address does not match the broadcaster address."
        });
        return;
      }

      // Create vault instance with the connected wallet
      const vault = new SimpleVault(
        publicClient,
        walletClient,
        contractAddress,
        chain
      );
      
      handleNotification({
        type: 'info',
        title: "Broadcasting Transaction",
        description: "Please confirm the transaction in your wallet"
      });
      
      const result = await vault.approveWithdrawalWithMetaTx(
        signedMetaTx,
        { from: broadcasterAddress as Address }
      );
      
      handleNotification({
        type: 'info',
        title: "Meta Transaction Submitted",
        description: `Transaction hash: ${result.hash}`
      });
      
      await result.wait();
      
      handleNotification({
        type: 'success',
        title: "Withdrawal Approved",
        description: "The withdrawal has been approved via meta transaction."
      });
      
      // Only close dialog and clean up after successful transaction
      setShowBroadcasterDialog(false);
      setSignedMetaTx(null);
      
      // After successful approval
      if (onApprovalSuccess) {
        await onApprovalSuccess();
      }
    } catch (error: any) {
      console.error("Meta transaction approval failed:", error);
      
      // Handle specific error cases
      if (error.code === 4001) {
        handleNotification({
          type: 'error',
          title: "Transaction Rejected",
          description: "You rejected the transaction in your wallet."
        });
      } else if (error.message?.includes('not been authorized')) {
        handleNotification({
          type: 'error',
          title: "Authorization Failed",
          description: "Please ensure you have connected the correct broadcaster wallet and approved the transaction."
        });
      } else {
        handleNotification({
          type: 'error',
          title: "Meta Transaction Failed",
          description: error.message || "Failed to approve withdrawal via meta transaction"
        });
      }
    } finally {
      setIsApproving(false);
    }
  };

  try {
    // Ensure amount is a BigInt and handle undefined
    const amount = tx.amount !== undefined ? BigInt(tx.amount) : 0n;

    return (
      <>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    {tx.status === TxStatus.PENDING && <Clock className="h-4 w-4 text-yellow-500" />}
                    {tx.status === TxStatus.CANCELLED && <XCircle className="h-4 w-4 text-red-500" />}
                    {tx.status === TxStatus.COMPLETED && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    <p className="font-medium">Transaction #{tx.txId.toString()}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Amount: {tx.type === "ETH" ? formatEther(amount) : formatUnits(amount, 18)} {tx.type}
                  </p>
                  <p className="text-sm text-muted-foreground">To: {tx.params.target}</p>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1">
                        <Button
                          onClick={handleApproveWithMetaTx}
                          disabled={isLoading || isApproving || isSigning || tx.status !== TxStatus.PENDING}
                          className={`w-full transition-all duration-200 flex items-center justify-center
                            bg-emerald-50 text-emerald-700 hover:bg-emerald-100 
                            dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 
                            border border-emerald-200 dark:border-emerald-800
                            disabled:opacity-50 disabled:cursor-not-allowed 
                            disabled:bg-slate-50 disabled:text-slate-400 
                            disabled:dark:bg-slate-900 disabled:dark:text-slate-500
                          `}
                          variant="outline"
                          aria-label={`Approve transaction #${tx.txId} with meta transaction`}
                        >
                          {isSigning ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              <span>Signing...</span>
                            </>
                          ) : isApproving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              <span>Approve</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Approve this withdrawal request using a meta-transaction
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1">
                        <Button
                          onClick={() => onCancel(Number(tx.txId))}
                          disabled={isLoading || tx.status !== TxStatus.PENDING}
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
                          {isLoading ? (
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
        
        {contractInfo && signedMetaTx && (
          <MetaTxApprovalDialog
            contractInfo={{
              ...contractInfo,
              timeLockPeriod: Number(contractInfo.timeLockPeriod)
            }}
            isOpen={showBroadcasterDialog}
            onOpenChange={setShowBroadcasterDialog}
            onSuccess={handleBroadcasterConnected}
            txId={Number(tx.txId)}
            title="Connect Broadcaster Wallet"
            description="Transaction has been signed. Now connect your broadcaster wallet to submit it to the blockchain without paying gas fees."
            actionLabel="Submit Transaction"
            walletType="broadcaster"
            contractAddress={contractAddress}
          />
        )}
      </>
    );
  } catch (error) {
    console.error("Error rendering pending transaction:", error);
    return <div>Error rendering transaction</div>;
  }
}; 