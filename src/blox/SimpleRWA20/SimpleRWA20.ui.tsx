"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Address, formatUnits, parseUnits } from "viem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import SimpleRWA20 from "./SimpleRWA20";
import { useChain } from "@/hooks/useChain";
import { atom, useAtom } from "jotai";
import { AlertCircle, Loader2, Coins, Shield, Info, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ContractInfo as BaseContractInfo } from "@/lib/verification/index";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hex } from "viem";
import { TransactionManagerProvider } from "@/contexts/TransactionManager";
import { useOperationTypes } from "@/hooks/useOperationTypes";
import { useMetaTxActions } from './hooks/useMetaTxActions';
import { useActionPermissions } from '@/hooks/useActionPermissions';
import { useRoleValidation } from "@/hooks/useRoleValidation";
import { MintForm, BurnForm } from './components';

// Extend the base ContractInfo interface
interface ContractInfo extends BaseContractInfo {
  owner: string;
  broadcaster: string;
  recoveryAddress: string;
}

// State atoms
const tokenInstanceAtom = atom<SimpleRWA20 | null>(null);

interface LoadingState {
  tokenInfo: boolean;
  mint: boolean;
  burn: boolean;
  transfer: boolean;
  approval: Record<number, boolean>;
  initialization: boolean;
}

const loadingStateAtom = atom<LoadingState>({
  tokenInfo: false,
  mint: false,
  burn: false,
  transfer: false,
  approval: {},
  initialization: true,
});

// Meta transaction settings
const META_TX_SETTINGS_KEY = 'simpleRWA20.metaTxSettings';

const DEFAULT_META_TX_SETTINGS = {
  deadline: BigInt(3600), // 1 hour in seconds
  maxGasPrice: BigInt(50000000000) // 50 gwei
};

const getStoredMetaTxSettings = () => {
  try {
    const stored = localStorage.getItem(META_TX_SETTINGS_KEY);
    if (!stored) return DEFAULT_META_TX_SETTINGS;
    const parsed = JSON.parse(stored);
    return {
      deadline: BigInt(parsed.deadline),
      maxGasPrice: BigInt(parsed.maxGasPrice)
    };
  } catch (error) {
    console.error('Failed to load meta tx settings:', error);
    return DEFAULT_META_TX_SETTINGS;
  }
};

const metaTxSettingsAtom = atom(getStoredMetaTxSettings());

// Settings Dialog Component
function MetaTxSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [settings, setSettings] = useAtom(metaTxSettingsAtom);
  const [deadline, setDeadline] = useState(() => Number(settings.deadline / BigInt(3600)));
  const [maxGasPrice, setMaxGasPrice] = useState(() => Number(settings.maxGasPrice / BigInt(1000000000)));

  useEffect(() => {
    if (open) {
      setDeadline(Number(settings.deadline / BigInt(3600)));
      setMaxGasPrice(Number(settings.maxGasPrice / BigInt(1000000000)));
    }
  }, [open, settings]);

  const handleSave = () => {
    const newSettings = {
      deadline: BigInt(deadline * 3600),
      maxGasPrice: BigInt(maxGasPrice * 1000000000)
    };

    setSettings(newSettings);
    
    try {
      localStorage.setItem(META_TX_SETTINGS_KEY, JSON.stringify({
        deadline: deadline * 3600,
        maxGasPrice: maxGasPrice * 1000000000
      }));
    } catch (error) {
      console.error('Failed to save settings to local storage:', error);
    }

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

interface TokenInfo {
  name: string;
  symbol: string;
  totalSupply: bigint;
  decimals: number;
}

interface SimpleRWA20UIProps {
  contractAddress?: Address;
  contractInfo?: ContractInfo;
  onError?: (error: Error) => void;
  _mock?: {
    account: { address: Address; isConnected: boolean };
    publicClient: any;
    walletClient: { data: any };
    chain: any;
    initialData?: {
      tokenInfo?: TokenInfo;
    };
  };
  dashboardMode?: boolean;
  renderSidebar?: boolean;
  addMessage?: (message: NotificationMessage) => void;
}

type NotificationMessage = {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
};

function SimpleRWA20UIContent({
  contractAddress,
  contractInfo,
  onError,
  _mock,
  dashboardMode = false,
  renderSidebar = false,
  addMessage
}: SimpleRWA20UIProps): JSX.Element {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = _mock?.walletClient || useWalletClient();
  const chain = _mock?.chain || useChain();
  const navigate = useNavigate();

  // State
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loadingState, setLoadingState] = useAtom(loadingStateAtom);
  const [token, setToken] = useAtom(tokenInstanceAtom);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Role validation
  const { isOwner } = useRoleValidation(contractAddress as Address, address, chain);

  // Refs
  const initialLoadDoneRef = useRef(false);

  // Get operation types
  const { getOperationName } = useOperationTypes(contractAddress as Address);

  // Refresh function
  const handleRefresh = useCallback(async () => {
    if (!token || _mock) {
      console.log("Cannot fetch: token not initialized or using mock data");
      return;
    }
    
    setLoadingState(prev => ({ ...prev, tokenInfo: true }));
    
    try {
      const [name, symbol, totalSupply, decimals] = await Promise.all([
        token.getName(),
        token.getSymbol(),
        token.getTotalSupply(),
        token.getDecimals()
      ]);

      setTokenInfo({
        name,
        symbol,
        totalSupply,
        decimals
      });
      
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch token data:", err);
      setError("Failed to fetch token data: " + (err.message || String(err)));
      onError?.(new Error("Failed to fetch token data: " + (err.message || String(err))));
    } finally {
      setLoadingState(prev => ({ ...prev, tokenInfo: false }));
    }
  }, [token, setTokenInfo, onError, _mock]);

  // Initialize token instance and load data
  useEffect(() => {
    if (!publicClient || !chain || !contractInfo || !contractAddress || !walletClient || initialLoadDoneRef.current) {
      return;
    }

    const initialize = async () => {
      try {
        setLoadingState(prev => ({ ...prev, initialization: true }));
        
        if (typeof contractAddress !== 'string' || !contractAddress.startsWith('0x')) {
          throw new Error('Invalid contract address');
        }

        const validatedAddress = contractAddress as `0x${string}`;
        const tokenInstance = new SimpleRWA20(
          publicClient, 
          walletClient, 
          validatedAddress, 
          chain
        );
        setToken(tokenInstance);

        const [name, symbol, totalSupply, decimals] = await Promise.all([
          tokenInstance.getName(),
          tokenInstance.getSymbol(),
          tokenInstance.getTotalSupply(),
          tokenInstance.getDecimals()
        ]);

        setTokenInfo({
          name,
          symbol,
          totalSupply,
          decimals
        });
        
        initialLoadDoneRef.current = true;
        setError(null);
      } catch (initError: any) {
        console.error("Failed to initialize token:", initError);
        setError(`Failed to initialize token contract: ${initError.message || String(initError)}`);
        onError?.(new Error(`Failed to initialize token contract: ${initError.message || String(initError)}`));
      } finally {
        setLoadingState(prev => ({ ...prev, initialization: false }));
      }
    };

    initialize();
  }, [publicClient, walletClient, contractAddress, chain, contractInfo]);

  // Get meta transaction actions
  useMetaTxActions(
    contractAddress as Address,
    addMessage,
    addMessage,
    handleRefresh
  );

  // Add these functions inside SimpleRWA20UIContent before the return statement
  const handleMint = async (to: Address, amount: bigint) => {
    if (!token || !address) {
      throw new Error("Token not initialized or wallet not connected");
    }

    setLoadingState(prev => ({ ...prev, mint: true }));
    try {
      const metaTx = await token.generateUnsignedMintMetaTx(to, amount, {
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        maxGasPrice: BigInt(50000000000) // 50 gwei
      });
      const tx = await token.mintWithMetaTx(metaTx, { from: address });
      await tx.wait();

      addMessage?.({
        type: 'success',
        title: 'Tokens Minted',
        description: 'Successfully minted tokens'
      });

      await handleRefresh();
    } catch (error: any) {
      console.error('Mint error:', error);
      addMessage?.({
        type: 'error',
        title: 'Mint Failed',
        description: error.message || 'Failed to mint tokens'
      });
    } finally {
      setLoadingState(prev => ({ ...prev, mint: false }));
    }
  };

  const handleBurn = async (amount: bigint) => {
    if (!token || !address) {
      throw new Error("Token not initialized or wallet not connected");
    }

    setLoadingState(prev => ({ ...prev, burn: true }));
    try {
      const metaTx = await token.generateUnsignedBurnMetaTx(address, amount, {
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
        maxGasPrice: BigInt(50000000000) // 50 gwei
      });
      const tx = await token.burnWithMetaTx(metaTx, { from: address });
      await tx.wait();

      addMessage?.({
        type: 'success',
        title: 'Tokens Burned',
        description: 'Successfully burned tokens'
      });

      await handleRefresh();
    } catch (error: any) {
      console.error('Burn error:', error);
      addMessage?.({
        type: 'error',
        title: 'Burn Failed',
        description: error.message || 'Failed to burn tokens'
      });
    } finally {
      setLoadingState(prev => ({ ...prev, burn: false }));
    }
  };

  // Loading state
  if (loadingState.initialization) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Initializing token...</p>
        </div>
      </div>
    );
  }

  // Error state
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
            const initializeToken = async () => {
              if (!publicClient || !chain) return;
              try {
                const tokenInstance = new SimpleRWA20(publicClient, walletClient, contractAddress as `0x${string}`, chain);
                setToken(tokenInstance);
                setError(null);
              } catch (err: any) {
                console.error("Failed to initialize token:", err);
                setError("Failed to initialize token contract");
                onError?.(new Error("Failed to initialize token contract"));
              } finally {
                setLoadingState(prev => ({ ...prev, initialization: false }));
              }
            };
            initializeToken();
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

  // Render sidebar content
  if (renderSidebar) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground">TOKEN INFO</h3>
          <Card className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Coins className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{tokenInfo?.symbol || 'Loading...'}</p>
                    <p className="text-sm text-muted-foreground">{tokenInfo?.name || 'Loading...'}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Supply</span>
                  <span className="text-sm font-medium">
                    {loadingState.tokenInfo ? (
                      <Skeleton className="h-4 w-20" />
                    ) : (
                      tokenInfo ? formatUnits(tokenInfo.totalSupply, tokenInfo.decimals) : '0'
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Decimals</span>
                  <span className="text-sm font-medium">{tokenInfo?.decimals || '18'}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="h-full overflow-auto">
      {chain?.id && contractInfo?.chainId && chain.id !== contractInfo.chainId && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Wrong Network</AlertTitle>
          <AlertDescription>
            This token was deployed on {contractInfo?.chainName || 'unknown network'}. Please switch to the correct network to perform operations.
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
                <h2 className="text-lg font-semibold">Simple RWA20</h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Secure ERC20 token for real-world assets with enhanced security features</p>
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
                disabled={loadingState.tokenInfo || !token}
              >
                {loadingState.tokenInfo ? (
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

          <MetaTxSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />

          <CardContent>
            <div className="space-y-6">
              {!dashboardMode ? (
                <Tabs defaultValue="info" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-background p-1 rounded-lg">
                    <TabsTrigger value="info" className="rounded-md data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-medium">Info</TabsTrigger>
                    <TabsTrigger value="mint" className="rounded-md data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-medium">Mint</TabsTrigger>
                    <TabsTrigger value="burn" className="rounded-md data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-medium">Burn</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="info">
                    <Card>
                      <CardHeader>
                        <CardTitle>Token Information</CardTitle>
                        <CardDescription>
                          View detailed information about the RWA20 token
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Name</Label>
                              <p className="text-sm mt-1">{tokenInfo?.name || 'Loading...'}</p>
                            </div>
                            <div>
                              <Label>Symbol</Label>
                              <p className="text-sm mt-1">{tokenInfo?.symbol || 'Loading...'}</p>
                            </div>
                            <div>
                              <Label>Total Supply</Label>
                              <p className="text-sm mt-1">
                                {loadingState.tokenInfo ? (
                                  <Skeleton className="h-4 w-20" />
                                ) : (
                                  tokenInfo ? formatUnits(tokenInfo.totalSupply, tokenInfo.decimals) : '0'
                                )}
                              </p>
                            </div>
                            <div>
                              <Label>Decimals</Label>
                              <p className="text-sm mt-1">{tokenInfo?.decimals || '18'}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="mint">
                    <Card>
                      <CardHeader>
                        <CardTitle>Mint Tokens</CardTitle>
                        <CardDescription>
                          Mint new tokens to a specified address (Owner only)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <MintForm
                          onSubmit={handleMint}
                          isLoading={loadingState.mint}
                          decimals={tokenInfo?.decimals || 18}
                          canMint={isOwner}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="burn">
                    <Card>
                      <CardHeader>
                        <CardTitle>Burn Tokens</CardTitle>
                        <CardDescription>
                          Burn tokens from your balance
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <BurnForm
                          onSubmit={handleBurn}
                          isLoading={loadingState.burn}
                          decimals={tokenInfo?.decimals || 18}
                          maxAmount={tokenInfo?.totalSupply || BigInt(0)}
                          canBurn={true}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4">
                      <div className="space-y-2">
                        <Label>Total Supply</Label>
                        <p className="text-2xl font-bold">
                          {loadingState.tokenInfo ? (
                            <Skeleton className="h-8 w-32" />
                          ) : (
                            tokenInfo ? formatUnits(tokenInfo.totalSupply, tokenInfo.decimals) : '0'
                          )}
                        </p>
                      </div>
                    </Card>
                    <Card className="p-4">
                      <div className="space-y-2">
                        <Label>Token Info</Label>
                        <div className="space-y-1">
                          <p className="text-sm">Symbol: {tokenInfo?.symbol || 'Loading...'}</p>
                          <p className="text-sm">Name: {tokenInfo?.name || 'Loading...'}</p>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Main export with proper providers
export default function SimpleRWA20UI(props: SimpleRWA20UIProps) {
  return (
    <TransactionManagerProvider>
      <SimpleRWA20UIContent {...props} />
    </TransactionManagerProvider>
  );
}
