import { useState, useEffect, Suspense } from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useParams } from 'react-router-dom';
import { Address } from 'viem';
import { AlertCircle, Info, AlertTriangle, CheckCircle, Shield, Timer, Network, Wallet, Key, Clock, Radio as RadioIcon, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useSecureContract } from '@/hooks/useSecureContract';
import type { SecureContractInfo } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { getContractDetails } from '@/lib/catalog';
import type { BloxContract } from '@/lib/catalog/types';
import { initializeUIComponents, getUIComponent, type BloxUIProps, type BloxSidebarProps } from '@/lib/catalog/bloxUIComponents';

interface Message {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
  timestamp: Date;
}

const BloxMiniApp: React.FC = () => {
  const { type, address } = useParams<{ type: string; address: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractInfo, setContractInfo] = useState<SecureContractInfo | null>(null);
  const [bloxContract, setBloxContract] = useState<BloxContract | null>(null);
  const [uiInitialized, setUiInitialized] = useState(false);
  const { validateAndLoadContract } = useSecureContract();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Initialize UI components on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeUIComponents();
        setUiInitialized(true);
      } catch (error) {
        console.error('Failed to initialize UI components:', error);
        setError('Failed to initialize UI components');
        addMessage({
          type: 'error',
          title: 'Initialization Failed',
          description: 'Failed to initialize UI components'
        });
      }
    };
    init();
  }, []);

  // Load contract info and blox details
  useEffect(() => {
    if (!address || !type || !uiInitialized) return;

    const loadContractInfo = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load secure contract info
        const info = await validateAndLoadContract(address as `0x${string}`);
        setContractInfo(info);

        // Load blox contract details from catalog
        const bloxDetails = await getContractDetails(type);
        if (!bloxDetails) {
          throw new Error(`Unknown Blox type: ${type}`);
        }
        setBloxContract(bloxDetails);
      } catch (error) {
        console.error('Error loading contract:', error);
        setError('Failed to load contract details. Please ensure this is a valid SecureOwnable contract.');
        addMessage({
          type: 'error',
          title: 'Loading Failed',
          description: 'Failed to load contract details. Please ensure this is a valid SecureOwnable contract.'
        });
      } finally {
        setLoading(false);
      }
    };

    loadContractInfo();
  }, [address, type, uiInitialized]);

  // Function to add messages that can be called from child components
  const addMessage = (message: Omit<Message, 'timestamp'>) => {
    setMessages(prev => [{
      ...message,
      timestamp: new Date()
    }, ...prev]);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addMessage({
      type: 'success',
      title: 'Copied',
      description: 'Address copied to clipboard'
    });
  };

  // Render the appropriate Blox UI based on type
  const renderBloxUI = () => {
    if (!uiInitialized) {
      return (
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">Initializing UI components...</p>
        </div>
      );
    }

    if (!type || !address) {
      return (
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">No Blox selected</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      );
    }

    if (error || !bloxContract) {
      return (
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">{error || `Unknown Blox type: ${type}`}</p>
        </div>
      );
    }

    // Get the dynamic UI component
    const BloxUI = getUIComponent(bloxContract.id);
    if (!BloxUI) {
      return (
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">UI component not found for type: {type}</p>
        </div>
      );
    }

    // Render the dynamic component
    return (
      <Suspense fallback={
        <div className="min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">Loading UI component...</p>
        </div>
      }>
        <BloxUI 
          contractAddress={address as `0x${string}`}
          contractInfo={{
            address: address as `0x${string}`,
            type: bloxContract.id,
            name: bloxContract.name,
            category: bloxContract.category,
            description: bloxContract.description,
            bloxId: bloxContract.id,
            chainId: contractInfo?.chainId,
            chainName: contractInfo?.chainName
          }}
          onError={(error) => {
            addMessage({
              type: 'error',
              title: 'Operation Failed',
              description: error.message || 'Failed to perform operation'
            });
          }}
        />
      </Suspense>
    );
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <h1 className="text-2xl font-bold">Blox Mini App</h1>
        <div className="flex items-center space-x-4">
          {/* Add header controls here */}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Sidebar */}
        <Card className={`border-r m-4 rounded-lg shadow-lg transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-0 opacity-0 m-0'}`}>
          <div className="h-full">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Blox Info</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(false)}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-12rem)] p-4">
              {!loading && !error && bloxContract && (
                <Suspense fallback={
                  <div className="flex items-center justify-center py-4">
                    <p className="text-sm text-muted-foreground">Loading sidebar...</p>
                  </div>
                }>
                  {(() => {
                    const BloxUI = getUIComponent(bloxContract.id);
                    if (!BloxUI) return null;
                    return (
                      <BloxUI 
                        contractAddress={address as `0x${string}`}
                        contractInfo={{
                          address: address as `0x${string}`,
                          type: bloxContract.id,
                          name: bloxContract.name,
                          category: bloxContract.category,
                          description: bloxContract.description,
                          bloxId: bloxContract.id,
                          chainId: contractInfo?.chainId,
                          chainName: contractInfo?.chainName
                        }}
                        onError={(error: Error) => {
                          addMessage({
                            type: 'error',
                            title: 'Operation Failed',
                            description: error.message || 'Failed to perform operation'
                          });
                        }}
                        renderSidebar
                      />
                    );
                  })()}
                </Suspense>
              )}
            </ScrollArea>
          </div>
        </Card>

        {/* Main Workspace */}
        <div className="flex-1 p-4">
          {!isSidebarOpen && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsSidebarOpen(true)}
              className="mb-4"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Card className="h-full rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">
                {type ? `${type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}` : 'Workspace'}
                {address && <span className="text-sm text-gray-500 ml-2">({address})</span>}
              </h2>
              <Separator className="my-4" />
              <div className="grid grid-cols-1 gap-4">
                {renderBloxUI()}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Sidebar - Properties & Messages */}
        <Card className="w-72 border-l m-4 rounded-lg shadow-lg">
          <div className="flex flex-col h-full">
            {/* Properties Section */}
            <Collapsible open={isPropertiesOpen} onOpenChange={setIsPropertiesOpen}>
              <CollapsibleTrigger className="w-full">
                <div className="p-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Security Settings</h2>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="h-[calc(50vh-8rem)] p-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-4">
                      <p className="text-sm text-muted-foreground">Loading security settings...</p>
                    </div>
                  ) : error ? (
                    <div className="p-4">
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    </div>
                  ) : contractInfo ? (
                    <div className="space-y-2">
                      {/* Owner */}
                      <div className="p-2 rounded-lg border bg-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-2">
                                    <Wallet className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">Owner</span>
                                    <Timer className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Two-phase temporal security</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex items-center gap-1">
                            <code className="text-xs text-muted-foreground">
                              {formatAddress(contractInfo.owner)}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(contractInfo.owner)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Broadcaster */}
                      <div className="p-2 rounded-lg border bg-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-2">
                                    <RadioIcon className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">Broadcaster</span>
                                    <Timer className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Two-phase temporal security</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex items-center gap-1">
                            <code className="text-xs text-muted-foreground">
                              {formatAddress(contractInfo.broadcaster)}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(contractInfo.broadcaster)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Recovery Address */}
                      <div className="p-2 rounded-lg border bg-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">Recovery</span>
                                    <Network className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Single-phase meta tx security</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex items-center gap-1">
                            <code className="text-xs text-muted-foreground">
                              {formatAddress(contractInfo.recoveryAddress)}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(contractInfo.recoveryAddress)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* TimeLock Period */}
                      <div className="p-2 rounded-lg border bg-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">TimeLock</span>
                                    <Network className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Single-phase meta tx security</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                              {contractInfo.timeLockPeriodInDays} days
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <p className="text-sm text-muted-foreground">No contract selected</p>
                    </div>
                  )}
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>

            {/* Notifications Section */}
            <Collapsible open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
              <CollapsibleTrigger className="w-full">
                <div className="p-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Notifications</h2>
                  {messages.length > 0 && (
                    <Badge 
                      variant="secondary" 
                      className="ml-2 bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      {messages.length}
                    </Badge>
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="h-[calc(50vh-8rem)] p-4">
                  <div className="space-y-2">
                    {messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No notifications to display
                      </p>
                    ) : (
                      messages.map((message, index) => (
                        <Alert 
                          key={index} 
                          variant={message.type === 'error' ? 'destructive' : 'default'}
                          className={`text-sm ${
                            message.type === 'warning' ? 'border-yellow-500 text-yellow-700' :
                            message.type === 'success' ? 'border-green-500 text-green-700' :
                            message.type === 'info' ? 'border-blue-500 text-blue-700' : ''
                          }`}
                        >
                          {message.type === 'error' && <AlertCircle className="h-4 w-4" />}
                          {message.type === 'warning' && <AlertTriangle className="h-4 w-4" />}
                          {message.type === 'info' && <Info className="h-4 w-4" />}
                          {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
                          <AlertTitle className="text-xs">{message.title}</AlertTitle>
                          <AlertDescription className="text-xs mt-1">
                            {message.description}
                            <div className="text-[10px] mt-1 opacity-70">
                              {message.timestamp.toLocaleTimeString()}
                            </div>
                          </AlertDescription>
                        </Alert>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BloxMiniApp; 