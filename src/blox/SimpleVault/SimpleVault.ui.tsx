"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Address, formatEther, parseEther, formatUnits, parseUnits } from "viem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import SimpleVault from "./SimpleVault";
import { useChain } from "@/hooks/useChain";
import { atom, useAtom } from "jotai";
import { AlertCircle, Loader2, Wallet, Coins, X, Shield, Info, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ContractInfo as BaseContractInfo } from "@/lib/verification/index";
import { AddTokenDialog } from "./components/AddTokenDialog";
import { PendingTransaction } from "./components/PendingTransaction";
import type { TokenState, TokenBalanceState } from "./components/TokenList";
import type { VaultTxRecord } from "./lib/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hex } from "viem";
import { NotificationMessage, VaultMetaTxParams } from './lib/types';
import { TransactionManagerProvider } from "@/contexts/MetaTransactionManager";
import { useWalletBalances, TokenBalance } from '@/hooks/useWalletBalances';
import { useOperations, VAULT_OPERATIONS } from './hooks/useOperations';
import { SimpleVaultService } from "./lib/services";
import { useWorkflowManager } from "@/hooks/useWorkflowManager";

// Extend the base ContractInfo interface to include broadcaster and other properties
interface ContractInfo extends BaseContractInfo {
  owner: string;
  broadcaster: string;
  recoveryAddress: string;
  timeLockPeriodInMinutes: number;
}

// State atoms following .cursorrules state management guidelines
const pendingTxsAtom = atom<VaultTxRecord[]>([]);
const vaultInstanceAtom = atom<SimpleVault | null>(null);
const vaultServiceAtom = atom<SimpleVaultService | null>(null);

// Add local storage persistence for tokens
const STORAGE_KEY = 'simpleVault.trackedTokens';

const getStoredTokens = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    
    const parsedData = JSON.parse(stored);
    // Convert stored string balances back to BigInt
    return Object.entries(parsedData).reduce((acc, [address, token]: [string, any]) => {
      acc[address] = {
        ...token,
        balance: token.balance ? BigInt(token.balance) : BigInt(0),
        loading: false
      };
      return acc;
    }, {} as TokenBalanceState);
  } catch (error) {
    console.error('Failed to load tokens from storage:', error);
    return {};
  }
};

const tokenBalanceAtom = atom<TokenBalanceState>(getStoredTokens());


interface LoadingState {
  ethBalance: boolean;
  tokenBalance: boolean;
  withdrawal: boolean;
  deposit: boolean;
  approval: Record<number, boolean>;
  cancellation: Record<number, boolean>;
  initialization: boolean;
  transactions: boolean;
}

const loadingStateAtom = atom<LoadingState>({
  ethBalance: false,
  tokenBalance: false,
  withdrawal: false,
  deposit: false,
  approval: {},
  cancellation: {},
  initialization: true,
  transactions: false,
});

interface WithdrawalFormProps {
  onSubmit: (to: Address, amount: bigint, token?: Address) => Promise<void>;
  isLoading: boolean;
  maxAmount: bigint;
  onTokenSelect?: (token: Address | undefined) => void;
  selectedTokenAddress: string;
  onSelectedTokenAddressChange: (value: string) => void;
  canRequestWithdrawal: boolean;
}

// Utility function to validate Ethereum addresses
const isValidAddress = (address: string): address is Address => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

const WithdrawalForm = ({ 
  onSubmit, 
  isLoading, 
  maxAmount, 
  selectedTokenAddress,
  onSelectedTokenAddressChange,
  onTokenSelect,
  canRequestWithdrawal
}: WithdrawalFormProps) => {
  const [to, setTo] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [tokenBalances] = useAtom(tokenBalanceAtom);

  const selectedToken = selectedTokenAddress === "ETH" ? undefined : tokenBalances[selectedTokenAddress];
  const tokenDecimals = selectedToken?.metadata?.decimals ?? 18;

  // Format the max amount based on token type
  const formattedMaxAmount = selectedTokenAddress === "ETH"
    ? formatEther(maxAmount)
    : formatUnits(maxAmount, tokenDecimals);

  useEffect(() => {
    console.log('Token selection changed:', selectedTokenAddress);
    onTokenSelect?.(selectedTokenAddress === "ETH" ? undefined : selectedTokenAddress as Address);
  }, [selectedTokenAddress, onTokenSelect]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    
    try {
      console.log('Submitting withdrawal:', { 
        to, 
        amount, 
        selectedTokenAddress,
        tokenDecimals 
      });

      const parsedAmount = selectedTokenAddress === "ETH" 
        ? parseEther(amount) 
        : parseUnits(amount, tokenDecimals);

      if (parsedAmount > maxAmount) {
        throw new Error("Amount exceeds vault balance");
      }

      // Validate the recipient address
      if (!isValidAddress(to)) {
        throw new Error("Invalid recipient address");
      }

      await onSubmit(
        to as Address, 
        parsedAmount, 
        selectedTokenAddress === "ETH" ? undefined : selectedTokenAddress as Address
      );
      setTo("");
      setAmount("");
    } catch (error: any) {
      console.error('Form submission error:', error);
      setError(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tokenSelect">Select Token</Label>
        <div id="tokenSelectWrapper">
          <Select
            value={selectedTokenAddress}
            onValueChange={onSelectedTokenAddressChange}
          >
            <SelectTrigger>
              <SelectValue>
                <div className="flex items-center gap-2">
                  {selectedTokenAddress === "ETH" ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <Wallet className="h-3 w-3 text-primary" />
                      </div>
                      <span>ETH</span>
                    </>
                  ) : tokenBalances[selectedTokenAddress]?.metadata ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                        {tokenBalances[selectedTokenAddress].metadata?.logo ? (
                          <img 
                            src={tokenBalances[selectedTokenAddress].metadata.logo} 
                            alt={tokenBalances[selectedTokenAddress].metadata.symbol} 
                            className="w-5 h-5 rounded-full"
                          />
                        ) : (
                          <Coins className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <span>{tokenBalances[selectedTokenAddress].metadata.symbol}</span>
                    </>
                  ) : (
                    "Select a token"
                  )}
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* ETH Option */}
              <SelectItem value="ETH">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <Wallet className="h-3 w-3 text-primary" />
                  </div>
                  <span>ETH</span>
                  <span className="ml-auto text-muted-foreground">
                    {formatEther(maxAmount)} available
                  </span>
                </div>
              </SelectItem>
              
              {/* ERC20 Token Options */}
              {Object.entries(tokenBalances).map(([address, token]) => (
                <SelectItem key={address} value={address}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      {token.metadata?.logo ? (
                        <img 
                          src={token.metadata.logo} 
                          alt={token.metadata.symbol} 
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <Coins className="h-3 w-3 text-primary" />
                      )}
                    </div>
                    <span>{token.metadata?.symbol || 'Unknown Token'}</span>
                    <span className="ml-auto text-muted-foreground">
                      {token.loading ? (
                        <Skeleton className="h-4 w-16" />
                      ) : (
                        `${formatUnits(token.balance || BigInt(0), token.metadata?.decimals || 18)} available`
                      )}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="to">Recipient Address</Label>
        <Input
          id="to"
          name="recipientAddress"
          placeholder="0x..."
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          pattern="^0x[a-fA-F0-9]{40}$"
          aria-label="Recipient address input"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">
          Amount ({selectedTokenAddress === "ETH" ? "ETH" : selectedToken?.metadata?.symbol || "Tokens"})
        </Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="any"
          min="0"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          aria-label={`${selectedTokenAddress === "ETH" ? "ETH" : "Token"} amount input`}
        />
        <div className="flex justify-between text-sm text-muted-foreground">
          <div>Available in vault: {
            selectedTokenAddress === "ETH"
              ? `${Number(formattedMaxAmount).toFixed(4)} ETH`
              : `${Number(formattedMaxAmount).toFixed(4)} ${selectedToken?.metadata?.symbol || "Tokens"}`
          }</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-primary"
            onClick={() => setAmount(formattedMaxAmount)}
          >
            Max
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button 
                type="submit" 
                disabled={isLoading || !canRequestWithdrawal} 
                className="w-full"
              >
                {isLoading ? "Processing..." : `Request ${
                  selectedTokenAddress === "ETH" ? "ETH" : selectedToken?.metadata?.symbol || "Token"
                } Withdrawal`}
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {!canRequestWithdrawal 
              ? "Only the owner can request withdrawals"
              : `Request withdrawal of ${
                  selectedTokenAddress === "ETH" ? "ETH" : selectedToken?.metadata?.symbol || "Token"
                }`
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </form>
  );
};

interface DepositFormProps {
  onSubmit: (amount: bigint, token?: Address) => Promise<void>;
  isLoading: boolean;
  walletBalances: {
    eth: bigint;
    tokens: Record<Address, TokenBalance>;
    isLoading: boolean;
    error: Error | null;
  };
  contractAddress: Address;
}

const DepositForm = React.memo(({ onSubmit, isLoading, walletBalances, contractAddress }: DepositFormProps) => {
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>("ETH");
  const [tokenBalances] = useAtom(tokenBalanceAtom);
  const { isOwner } = useWorkflowManager(contractAddress);

  const selectedToken = selectedTokenAddress === "ETH" ? undefined : tokenBalances[selectedTokenAddress as Address];
  const tokenDecimals = selectedToken?.metadata?.decimals ?? 18;

  // Get the maximum amount from wallet balance
  const maxAmount = selectedTokenAddress === "ETH"
    ? walletBalances.eth
    : walletBalances.tokens[selectedTokenAddress as Address]?.balance || BigInt(0);

  // Format the max amount based on token type
  const formattedMaxAmount = selectedTokenAddress === "ETH"
    ? formatEther(maxAmount)
    : formatUnits(maxAmount, tokenDecimals);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    
    try {
      console.log('Submitting deposit:', { 
        amount, 
        selectedTokenAddress,
        tokenDecimals 
      });

      const parsedAmount = selectedTokenAddress === "ETH" 
        ? parseEther(amount) 
        : parseUnits(amount, tokenDecimals);

      if (parsedAmount > maxAmount) {
        throw new Error("Amount exceeds wallet balance");
      }

      await onSubmit(
        parsedAmount,
        selectedTokenAddress === "ETH" ? undefined : selectedTokenAddress as Address
      );
      setAmount("");
      setSelectedTokenAddress("ETH");
    } catch (error: any) {
      console.error('Form submission error:', error);
      setError(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tokenSelect">Select Token</Label>
        <Select
          value={selectedTokenAddress}
          onValueChange={setSelectedTokenAddress}
        >
          <SelectTrigger>
            <SelectValue>
              <div className="flex items-center gap-2">
                {selectedTokenAddress === "ETH" ? (
                  <>
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <Wallet className="h-3 w-3 text-primary" />
                    </div>
                    <span>ETH</span>
                  </>
                ) : tokenBalances[selectedTokenAddress]?.metadata ? (
                  <>
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      {tokenBalances[selectedTokenAddress].metadata?.logo ? (
                        <img 
                          src={tokenBalances[selectedTokenAddress].metadata.logo} 
                          alt={tokenBalances[selectedTokenAddress].metadata.symbol} 
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <Coins className="h-3 w-3 text-primary" />
                      )}
                    </div>
                    <span>{tokenBalances[selectedTokenAddress].metadata.symbol}</span>
                  </>
                ) : (
                  "Select a token"
                )}
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* ETH Option */}
            <SelectItem value="ETH">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-3 w-3 text-primary" />
                </div>
                <span>ETH</span>
                <span className="ml-auto text-muted-foreground">
                  {formatEther(walletBalances.eth)} available
                </span>
              </div>
            </SelectItem>
            
            {/* ERC20 Token Options */}
            {Object.entries(tokenBalances).map(([address, token]) => {
              const tokenAddress = address as Address;
              const walletToken = walletBalances.tokens[tokenAddress];
              return (
                <SelectItem key={tokenAddress} value={tokenAddress}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      {token.metadata?.logo ? (
                        <img 
                          src={token.metadata.logo} 
                          alt={token.metadata.symbol} 
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <Coins className="h-3 w-3 text-primary" />
                      )}
                    </div>
                    <span>{token.metadata?.symbol || 'Unknown Token'}</span>
                    <span className="ml-auto text-muted-foreground">
                      {token.loading ? (
                        <Skeleton className="h-4 w-16" />
                      ) : (
                        `${formatUnits(walletToken?.balance || BigInt(0), token.metadata?.decimals || 18)} available`
                      )}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">
          Amount ({selectedTokenAddress === "ETH" ? "ETH" : selectedToken?.metadata?.symbol || "Tokens"})
        </Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="any"
          min="0"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          aria-label={`${selectedTokenAddress === "ETH" ? "ETH" : "Token"} amount input`}
        />
        <div className="flex justify-between text-sm text-muted-foreground">
          <div>Available in wallet: {
            selectedTokenAddress === "ETH"
              ? `${Number(formattedMaxAmount).toFixed(4)} ETH`
              : `${Number(formattedMaxAmount).toFixed(4)} ${selectedToken?.metadata?.symbol || "Tokens"}`
          }</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-primary"
            onClick={() => setAmount(formattedMaxAmount)}
          >
            Max
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Processing..." : `${isOwner ? "Deposit" : "Send"} ${
          selectedTokenAddress === "ETH" ? "ETH" : selectedToken?.metadata?.symbol || "Token"
        }`}
      </Button>
    </form>
  );
});

DepositForm.displayName = 'DepositForm';



interface SimpleVaultUIProps {
  contractAddress?: Address;  // Make contractAddress optional
  contractInfo?: ContractInfo;  // Make contractInfo optional
  onError?: (error: Error) => void;
  dashboardMode?: boolean;
  renderSidebar?: boolean;
  addMessage?: (message: NotificationMessage) => void;
}

// Add storage key for meta tx settings
const META_TX_SETTINGS_KEY = 'simpleVault.metaTxSettings';

// Update the settings atom to be writable with initial value from storage or default
const defaultMetaTxSettings: VaultMetaTxParams = {
  deadline: BigInt(3600), // 1 hour in seconds
  maxGasPrice: BigInt(50000000000) // 50 gwei
};

const metaTxSettingsAtom = atom<VaultMetaTxParams>(defaultMetaTxSettings);

// Add settings dialog component
function MetaTxSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [vaultService] = useAtom(vaultServiceAtom);
  const [settings, setSettings] = useAtom(metaTxSettingsAtom);
  const [deadline, setDeadline] = useState(() => Number(settings.deadline / BigInt(3600)));
  const [maxGasPrice, setMaxGasPrice] = useState(() => Number(settings.maxGasPrice / BigInt(1000000000)));

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      // Try to get stored settings from service if available
      if (vaultService) {
        const storedSettings = vaultService.getStoredMetaTxSettings();
        setDeadline(Number(storedSettings.deadline / BigInt(3600)));
        setMaxGasPrice(Number(storedSettings.maxGasPrice / BigInt(1000000000)));
      } else {
        setDeadline(Number(settings.deadline / BigInt(3600)));
        setMaxGasPrice(Number(settings.maxGasPrice / BigInt(1000000000)));
      }
    }
  }, [open, settings, vaultService]);

  const handleSave = () => {
    // Convert hours to seconds and gwei to wei
    const newSettings: VaultMetaTxParams = {
      deadline: BigInt(deadline * 3600),
      maxGasPrice: BigInt(maxGasPrice * 1000000000)
    };

    // Update state
    setSettings(newSettings);
    
    // Save to local storage via service if available
    if (vaultService) {
      vaultService.storeMetaTxSettings(newSettings);
    } else {
      // Fallback to direct localStorage if service not available
      try {
        localStorage.setItem(META_TX_SETTINGS_KEY, JSON.stringify({
          deadline: deadline * 3600,
          maxGasPrice: maxGasPrice * 1000000000
        }));
      } catch (error) {
        console.error('Failed to save settings to local storage:', error);
      }
    }

    // Close the dialog
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Meta Transaction Settings</DialogTitle>
          <DialogDescription>
            Configure default parameters for meta-transactions
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="deadline" className="col-span-2">
              Deadline (hours)
            </Label>
            <Input
              id="deadline"
              type="number"
              value={deadline}
              onChange={(e) => setDeadline(Number(e.target.value))}
              min={1}
              max={24}
              className="col-span-2"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="maxGasPrice" className="col-span-2">
              Max Gas Price (gwei)
            </Label>
            <Input
              id="maxGasPrice"
              type="number"
              value={maxGasPrice}
              onChange={(e) => setMaxGasPrice(Number(e.target.value))}
              min={1}
              className="col-span-2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Update the WithdrawalFormWrapper to use workflow manager for permission checks
const WithdrawalFormWrapper = React.memo(({ 
  handleWithdrawal, 
  loadingState, 
  ethBalance, 
  fetchTokenBalance,
  tokenBalances,
  contractAddress
}: { 
  handleWithdrawal: (to: Address, amount: bigint, token?: Address) => Promise<void>;
  loadingState: LoadingState;
  ethBalance: bigint;
  fetchTokenBalance: (tokenAddress: Address) => Promise<void>;
  tokenBalances: TokenBalanceState;
  contractAddress: Address;
}) => {
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>("ETH");
  const lastFetchRef = useRef<string | undefined>(undefined);
  
  // Use workflow manager instead of useActionPermissions
  const { isOwner } = useWorkflowManager(contractAddress);

  // Check if user can request withdrawals
  const canRequestWithdrawal = useMemo(() => {
    return isOwner;
  }, [isOwner]);

  // Memoize the token selection handler
  const handleTokenSelect = useCallback((token: Address | undefined) => {
    console.log('Token selected in wrapper:', token);
  }, []);

  // Memoize the current balance calculation
  const currentBalance = useMemo(() => 
    selectedTokenAddress === "ETH"
      ? ethBalance
      : (tokenBalances[selectedTokenAddress]?.balance || BigInt(0)),
    [selectedTokenAddress, tokenBalances, ethBalance]
  );

  // Only fetch token balance when necessary
  useEffect(() => {
    const tokenAddress = selectedTokenAddress === "ETH" ? undefined : selectedTokenAddress as Address;
    if (tokenAddress && 
        tokenAddress !== lastFetchRef.current && 
        !loadingState.tokenBalance && 
        !tokenBalances[tokenAddress]?.loading) {
      console.log('Fetching balance for selected token:', tokenAddress);
      lastFetchRef.current = tokenAddress;
      fetchTokenBalance(tokenAddress);
    }
  }, [selectedTokenAddress, loadingState.tokenBalance, tokenBalances, fetchTokenBalance]);

  const handleSelectedTokenChange = useCallback((value: string) => {
    console.log('Token selection changing to:', value);
    setSelectedTokenAddress(value);
  }, []);

  return (
    <WithdrawalForm
      onSubmit={handleWithdrawal}
      isLoading={loadingState.withdrawal}
      maxAmount={currentBalance}
      selectedTokenAddress={selectedTokenAddress}
      onSelectedTokenAddressChange={handleSelectedTokenChange}
      onTokenSelect={handleTokenSelect}
      canRequestWithdrawal={canRequestWithdrawal}
    />
  );
});

WithdrawalFormWrapper.displayName = 'WithdrawalFormWrapper';

function SimpleVaultUIContent({ 
  contractAddress, 
  contractInfo, 
  onError,
  dashboardMode = false,
  renderSidebar = false,
  addMessage
}: SimpleVaultUIProps): JSX.Element {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chain = useChain();
  const navigate = useNavigate();
  
  // State declarations
  const [ethBalance, setEthBalance] = useState<bigint>(BigInt(0));
  const [tokenBalances, setTokenBalances] = useAtom<TokenBalanceState>(tokenBalanceAtom);
  const [pendingTxs, setPendingTxs] = useAtom(pendingTxsAtom);
  const [loadingState, setLoadingState] = useAtom(loadingStateAtom);
  const [vault, setVault] = useAtom(vaultInstanceAtom);
  const [vaultService, setVaultService] = useAtom(vaultServiceAtom);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Keep metaTxSettings since it's used in createVaultMetaTxParams
  const [metaTxSettings, setSettings] = useAtom(metaTxSettingsAtom);

  // Add this near other refs/state
  const initialLoadDoneRef = useRef(false);
  
  // Define handleRefresh before it's used
  const handleRefresh = useCallback(async () => {
    if (!vault || !vaultService) {
      console.log("Cannot fetch: vault not initialized");
      return;
    }
    
    setLoadingState(prev => ({ ...prev, ethBalance: true }));
    
    try {
      const balance = await vault.getEthBalance();
      setEthBalance(balance);
      
      const transactions = await vaultService.getPendingTransactions();
      setPendingTxs(transactions);
      
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch vault data:", err);
      setError("Failed to fetch vault data: " + (err.message || String(err)));
      onError?.(new Error("Failed to fetch vault data: " + (err.message || String(err))));
    } finally {
      setLoadingState(prev => ({ ...prev, ethBalance: false }));
    }
  }, [vault, vaultService, setEthBalance, setPendingTxs, onError]);
  
  // Use workflow manager for role validation with more comprehensive permission model
  const { 
    isOwner
  } = useWorkflowManager(contractAddress as Address);
  
  // Get operations actions and state
  const {
    handleApproveWithdrawal,
    handleCancelWithdrawal,
    loadingStates: operationsLoadingStates,
    getOperationName: getVaultOperationName
  } = useOperations({
    contractAddress: contractAddress as Address,
    onSuccess: addMessage,
    onError: addMessage, 
    onRefresh: handleRefresh
  });

  // Load meta transaction settings from service when available
  useEffect(() => {
    if (vaultService) {
      const storedSettings = vaultService.getStoredMetaTxSettings();
      setSettings(storedSettings);
    }
  }, [vaultService]);

  // Save metaTxSettings to storage when they change
  useEffect(() => {
    if (vaultService) {
      vaultService.storeMetaTxSettings(metaTxSettings);
    } else {
      try {
        localStorage.setItem(META_TX_SETTINGS_KEY, JSON.stringify({
          deadline: metaTxSettings.deadline.toString(),
          maxGasPrice: metaTxSettings.maxGasPrice.toString()
        }));
      } catch (error) {
        console.error('Failed to save meta tx settings to storage:', error);
      }
    }
  }, [metaTxSettings, vaultService]);

  // Add wallet balances hook after state declarations
  const trackedTokenAddresses = Object.keys(tokenBalances) as Address[];
  const walletBalances = useWalletBalances(trackedTokenAddresses);

  // Filter transactions for withdrawals
  const filteredPendingTxs = React.useMemo(() => {
    return pendingTxs.filter(tx => {
      const operationTypeHex = tx.params.operationType as Hex;
      const operationName = getVaultOperationName(operationTypeHex);
      return operationName === VAULT_OPERATIONS.WITHDRAW_ETH || 
             operationName === VAULT_OPERATIONS.WITHDRAW_TOKEN;
    });
  }, [pendingTxs, getVaultOperationName]);

  // Modify the initialization effect to only run once
  useEffect(() => {
    if (!publicClient || !chain || !contractInfo || !contractAddress || !walletClient || initialLoadDoneRef.current) {
      return;
    }

    const initialize = async () => {
      try {
        setLoadingState(prev => ({ ...prev, initialization: true }));
        
        // Create vault instance with validated address
        const vaultInstance = new SimpleVault(
          publicClient, 
          walletClient, 
          contractAddress, 
          chain
        );
        setVault(vaultInstance);
        
        // Create service instance
        const serviceInstance = new SimpleVaultService(
          publicClient,
          walletClient,
          contractAddress,
          chain
        );
        setVaultService(serviceInstance);

        // Fetch initial data only once
        const balance = await vaultInstance.getEthBalance();
        setEthBalance(balance);

        // Fetch initial transactions
        const transactions = await serviceInstance.getPendingTransactions();
        setPendingTxs(transactions);
        
        initialLoadDoneRef.current = true;
        setError(null);
      } catch (initError: any) {
        console.error("Failed to initialize vault:", initError);
        setError(`Failed to initialize vault contract: ${initError.message || String(initError)}`);
        onError?.(new Error(`Failed to initialize vault contract: ${initError.message || String(initError)}`));
      } finally {
        setLoadingState(prev => ({ ...prev, initialization: false }));
      }
    };

    initialize();
  }, [publicClient, walletClient, contractAddress, chain, contractInfo]);

  // Notification handler
  const handleNotification = React.useCallback((message: NotificationMessage): void => {
    if (addMessage) {
      addMessage(message);
    } else {
      console.log('Notification:', message);
    }
  }, [addMessage]);

  // Add these functions before the return statement
  const handleDeposit = async (amount: bigint, token?: Address) => {
    if (!vault || !vaultService || !address) {
      throw new Error("Vault not initialized or wallet not connected");
    }

    setLoadingState(prev => ({ ...prev, deposit: true }));
    try {
      let tx;
      if (token) {
        // For ERC20 tokens, first check and handle allowance
        const allowance = await vaultService.getTokenAllowance(token, address);
        if (allowance < amount) {
          // Request approval first
          tx = await vaultService.approveTokenAllowance(token, amount, { from: address });
          await tx.wait();
        }
        // Now deposit the tokens
        tx = await vaultService.depositToken(token, amount, { from: address });
      } else {
        // For ETH deposits
        tx = await vaultService.depositEth(amount, { from: address });
      }

      // Wait for transaction confirmation
      await tx.wait();

      // Show success message
      addMessage?.({
        type: 'success',
        title: 'Deposit Successful',
        description: `Successfully deposited ${token ? 'tokens' : 'ETH'} to vault`
      });

      // Refresh balances
      await handleRefresh();
    } catch (error: any) {
      console.error('Deposit error:', error);
      addMessage?.({
        type: 'error',
        title: 'Deposit Failed',
        description: error.message || 'Failed to deposit to vault'
      });
    } finally {
      setLoadingState(prev => ({ ...prev, deposit: false }));
    }
  };

  const handleWithdrawal = async (to: Address, amount: bigint, token?: Address): Promise<void> => {
    if (!vaultService || !address) {
      throw new Error("Service not initialized or wallet not connected");
    }

    setLoadingState(prev => ({ ...prev, withdrawal: true }));
    try {
      let tx;
      if (token) {
        // Request token withdrawal via service
        tx = await vaultService.withdrawTokenRequest(token, to, amount, { from: address });
      } else {
        // Request ETH withdrawal via service
        tx = await vaultService.withdrawEthRequest(to, amount, { from: address });
      }

      // Wait for transaction confirmation
      await tx.wait();

      // Show success message
      addMessage?.({
        type: 'success',
        title: 'Withdrawal Request Submitted',
        description: `Successfully submitted withdrawal request for ${token ? 'tokens' : 'ETH'}`
      });

      // Refresh transactions
      await handleRefresh();
    } catch (error: any) {
      console.error('Withdrawal request error:', error);
      addMessage?.({
        type: 'error',
        title: 'Withdrawal Request Failed',
        description: error.message || 'Failed to submit withdrawal request'
      });
    } finally {
      setLoadingState(prev => ({ ...prev, withdrawal: false }));
    }
  };

  // Update loadingState to include timeLockLoadingStates
  useEffect(() => {
    setLoadingState(prev => ({
      ...prev,
      approval: operationsLoadingStates.approval,
      cancellation: operationsLoadingStates.cancellation
    }));
  }, [operationsLoadingStates]);

  const fetchTokenBalance = async (tokenAddress: Address): Promise<void> => {
    if (!vault || !vaultService) return;
    
    setLoadingState(prev => ({
      ...prev,
      tokenBalance: true
    }));

    try {
      const balance = await vault.getTokenBalance(tokenAddress);
      const metadata = await vaultService.getTokenMetadata(tokenAddress);
      
      setTokenBalances(prev => ({
        ...prev,
        [tokenAddress]: {
          balance,
          metadata,
          loading: false,
          error: undefined
        } as TokenState
      }));
    } catch (error) {
      console.error('Error fetching token balance:', error);
      setTokenBalances(prev => ({
        ...prev,
        [tokenAddress]: {
          ...prev[tokenAddress],
          loading: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as TokenState
      }));
    } finally {
      setLoadingState(prev => ({
        ...prev,
        tokenBalance: false
      }));
    }
  };

  const handleRemoveToken = (tokenAddress: string): void => {
    setTokenBalances(prev => {
      const newBalances = { ...prev };
      delete newBalances[tokenAddress];
      
      // Update local storage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newBalances));
      } catch (error) {
        console.error('Failed to update local storage:', error);
      }
      
      return newBalances;
    });
  };

  // Render sidebar content
  if (renderSidebar) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground">NATIVE TOKEN</h3>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">ETH</p>
                  <div className="text-sm text-muted-foreground">
                    {loadingState.ethBalance ? (
                      <Skeleton className="h-4 w-20" />
                    ) : (
                      formatEther(ethBalance)
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm text-muted-foreground">ERC20 TOKENS</h3>
            <AddTokenDialog
              onAddToken={async (address) => {
                await fetchTokenBalance(address);
                handleNotification({
                  type: 'success',
                  title: "Token Added",
                  description: "The token has been added to your tracking list"
                });
              }}
              isLoading={loadingState.tokenBalance}
            />
          </div>
          <div className="space-y-2">
            {Object.entries(tokenBalances).map(([tokenAddress, token]) => (
              <Card key={tokenAddress} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {token.metadata?.logo ? (
                      <img 
                        src={token.metadata.logo} 
                        alt={token.metadata.symbol} 
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Coins className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{token.metadata?.symbol || 'Unknown Token'}</p>
                      <div className="text-sm text-muted-foreground">
                        {token.loading ? (
                          <Skeleton className="h-4 w-20" />
                        ) : token.error ? (
                          <span className="text-destructive">Error loading balance</span>
                        ) : (
                          formatUnits(token.balance || BigInt(0), token.metadata?.decimals || 18)
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleRemoveToken(tokenAddress)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
            {Object.keys(tokenBalances).length === 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">No tokens added yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loadingState.initialization) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Initializing vault...</p>
        </div>
      </div>
    );
  }

  // Error state with refresh button
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button 
          variant="outline" 
          onClick={() => {
            setLoadingState(prev => ({ ...prev, initialization: true }));
            // Only reinitialize the vault, don't fetch data
            const initializeVault = async () => {
              if (!publicClient || !chain) return;
              try {
                const vaultInstance = new SimpleVault(publicClient, walletClient, contractAddress as `0x${string}`, chain);
                setVault(vaultInstance);
                setError(null);
              } catch (err: any) {
                console.error("Failed to initialize vault:", err);
                setError("Failed to initialize vault contract");
                onError?.(new Error("Failed to initialize vault contract"));
              } finally {
                setLoadingState(prev => ({ ...prev, initialization: false }));
              }
            };
            initializeVault();
          }}
          disabled={loadingState.initialization}
        >
          {loadingState.initialization ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Retrying...
            </>
          ) : (
            'Retry Connection'
          )}
        </Button>
      </div>
    );
  }

  // Update the dashboard mode view
  if (dashboardMode) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-medium">Deposit</h3>
          <Card>
            <CardContent className="pt-6">
              <DepositForm
                onSubmit={handleDeposit}
                isLoading={loadingState.deposit}
                walletBalances={walletBalances}
                contractAddress={contractAddress as Address}
              />
            </CardContent>
          </Card>
        </div>

        {pendingTxs.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium">Pending Transactions</h3>
            <div className="space-y-2">
              {filteredPendingTxs.slice(0, 2).map((tx) => {
                
                return (
                  <PendingTransaction
                    key={tx.txId}
                    tx={tx}
                    onApprove={handleApproveWithdrawal}
                    onCancel={handleCancelWithdrawal}
                    isLoading={operationsLoadingStates.approval[Number(tx.txId)] || operationsLoadingStates.cancellation[Number(tx.txId)]}
                    contractAddress={contractAddress as Address}
                    onNotification={handleNotification}
                    onRefresh={handleRefresh}
                    mode="timelock"
                    timeLockPeriodInMinutes={contractInfo?.timeLockPeriodInMinutes || 0}
                  />
                );
              })}
              {filteredPendingTxs.length > 2 && (
                <Button
                  variant="link"
                  className="w-full"
                  onClick={() => navigate(`/contracts/${contractAddress}`)}
                >
                  View All Transactions
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fix the network warning JSX
  return (
    <div className="h-full overflow-auto">
      {chain?.id && contractInfo?.chainId && chain.id !== contractInfo.chainId && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Wrong Network</AlertTitle>
          <AlertDescription>
            This vault was deployed on {contractInfo?.chainName || 'unknown network'}. Please switch to the correct network to perform operations.
          </AlertDescription>
        </Alert>
      )}
      
      <div className={dashboardMode ? "p-0" : "container mx-auto p-4"}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Simple Vault</h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Secure storage for ETH and tokens with time-locked withdrawals</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loadingState.ethBalance || !vault}
              >
                {loadingState.ethBalance ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  'Refresh'
                )}
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Configure meta-transaction settings</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>

          {/* Add settings dialog */}
          <MetaTxSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />

          <CardContent>
            <div className="space-y-6">
              {!dashboardMode ? (
                <Tabs defaultValue="deposit" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-background p-1 rounded-lg">
                    <TabsTrigger value="deposit" className="rounded-md data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-medium">Deposit</TabsTrigger>
                    <TabsTrigger value="withdraw" className="rounded-md data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-medium">Withdraw</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="deposit">
                    <Card>
                      <CardHeader>
                        <CardTitle>{isOwner ? "Deposit" : "Send"}</CardTitle>
                        <CardDescription>
                          {isOwner 
                            ? "Deposit ETH or tokens into your vault"
                            : "Send ETH or tokens to the vault owner"
                          }
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <DepositForm
                          onSubmit={handleDeposit}
                          isLoading={loadingState.deposit}
                          walletBalances={walletBalances}
                          contractAddress={contractAddress as Address}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="withdraw">
                    <Card>
                      <CardHeader>
                        <CardTitle>Request Withdrawal</CardTitle>
                        <CardDescription>
                          Withdrawals are subject to a time-lock period for security
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <WithdrawalFormWrapper
                          handleWithdrawal={handleWithdrawal}
                          loadingState={loadingState}
                          ethBalance={ethBalance}
                          fetchTokenBalance={fetchTokenBalance}
                          tokenBalances={tokenBalances}
                          contractAddress={contractAddress as Address}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              ) : (
                /* Dashboard mode: Show simplified view */
                pendingTxs.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-medium">Pending Transactions</h3>
                    <div className="space-y-2">
                      {filteredPendingTxs.slice(0, 2).map((tx) => {
                        
                        return (
                          <PendingTransaction
                            key={tx.txId}
                            tx={tx}
                            onApprove={handleApproveWithdrawal}
                            onCancel={handleCancelWithdrawal}
                            isLoading={operationsLoadingStates.approval[Number(tx.txId)] || operationsLoadingStates.cancellation[Number(tx.txId)]}
                            contractAddress={contractAddress as Address}
                            onNotification={handleNotification}
                            onRefresh={handleRefresh}
                            mode="timelock"
                            timeLockPeriodInMinutes={contractInfo?.timeLockPeriodInMinutes || 0}
                          />
                        );
                      })}
                      {filteredPendingTxs.length > 2 && (
                        <Button
                          variant="link"
                          className="w-full"
                          onClick={() => navigate(`/contracts/${contractAddress}`)}
                        >
                          View All Transactions
                        </Button>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Main export with proper providers
export default function SimpleVaultUI(props: SimpleVaultUIProps) {
  return (
    <TransactionManagerProvider>
      <SimpleVaultUIContent {...props} />
    </TransactionManagerProvider>
  );
}
