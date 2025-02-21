import { useAccount } from 'wagmi'
import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Key,
  Radio,
  Clock,
  Shield,
  Wallet,
  X
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Alert, AlertDescription } from '../components/ui/alert'
import { useSecureContract } from '@/hooks/useSecureContract'
import { useToast } from '../components/ui/use-toast'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '../components/ui/dialog'
import type { SecureContractInfo } from '@/lib/types'
import { Address } from 'viem'
import { SingleWalletManagerProvider, useSingleWallet } from '@/components/SingleWalletManager'
import { formatAddress } from '@/lib/utils'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

function RecoveryWalletContent({ 
  contractInfo, 
  onSuccess,
  onClose 
}: { 
  contractInfo: SecureContractInfo | null,
  onSuccess: () => void,
  onClose: () => void
}) {
  const { session, isConnecting, connect, disconnect } = useSingleWallet()
  const [isRecoveryWalletConnected, setIsRecoveryWalletConnected] = useState(false)

  useEffect(() => {
    if (session && contractInfo) {
      setIsRecoveryWalletConnected(
        session.account.toLowerCase() === contractInfo.recoveryAddress.toLowerCase()
      )
    } else {
      setIsRecoveryWalletConnected(false)
    }
  }, [session, contractInfo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center space-x-2">
        <div className="flex-1">
          {session ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Connected Wallet</span>
                  <span className="text-xs text-muted-foreground">
                    {formatAddress(session.account)}
                  </span>
                </div>
                <Button
                  onClick={() => void disconnect()}
                  variant="ghost"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {!isRecoveryWalletConnected && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Connected wallet does not match the recovery address. Please connect the correct wallet.
                  </AlertDescription>
                </Alert>
              )}
              {isRecoveryWalletConnected && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertDescription className="text-green-500">
                    Recovery wallet connected successfully!
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <Button
              onClick={() => void connect()}
              disabled={isConnecting}
              className="w-full"
              variant="outline"
            >
              <Wallet className="mr-2 h-4 w-4" />
              {isConnecting ? 'Connecting...' : 'Connect Recovery Wallet'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
        >
          Close
        </Button>
        {isRecoveryWalletConnected && (
          <Button
            onClick={onSuccess}
            className="ml-auto"
          >
            Continue with Transfer Request
          </Button>
        )}
      </div>
    </div>
  )
}

function BroadcasterWalletContent({ 
  contractInfo, 
  onSuccess,
  onClose 
}: { 
  contractInfo: SecureContractInfo | null,
  onSuccess: () => void,
  onClose: () => void
}) {
  const { session, isConnecting, connect, disconnect } = useSingleWallet()
  const [isBroadcasterWalletConnected, setIsBroadcasterWalletConnected] = useState(false)

  useEffect(() => {
    if (session && contractInfo) {
      setIsBroadcasterWalletConnected(
        session.account.toLowerCase() === contractInfo.broadcaster.toLowerCase()
      )
    } else {
      setIsBroadcasterWalletConnected(false)
    }
  }, [session, contractInfo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center space-x-2">
        <div className="flex-1">
          {session ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Connected Wallet</span>
                  <span className="text-xs text-muted-foreground">
                    {formatAddress(session.account)}
                  </span>
                </div>
                <Button
                  onClick={() => void disconnect()}
                  variant="ghost"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {!isBroadcasterWalletConnected && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Connected wallet does not match the broadcaster address. Please connect the correct wallet.
                  </AlertDescription>
                </Alert>
              )}
              {isBroadcasterWalletConnected && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertDescription className="text-green-500">
                    Broadcaster wallet connected successfully!
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <Button
              onClick={() => void connect()}
              disabled={isConnecting}
              className="w-full"
              variant="outline"
            >
              <Wallet className="mr-2 h-4 w-4" />
              {isConnecting ? 'Connecting...' : 'Connect Broadcaster Wallet'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function SecurityDetails() {
  const { address } = useParams<{ address: string }>()
  const { isConnected } = useAccount()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contractInfo, setContractInfo] = useState<SecureContractInfo | null>(null)
  const { validateAndLoadContract } = useSecureContract()
  const { toast } = useToast()

  // State for input fields
  const [newOwnerAddress, setNewOwnerAddress] = useState('')
  const [newBroadcasterAddress, setNewBroadcasterAddress] = useState('')
  const [newRecoveryAddress, setNewRecoveryAddress] = useState('')
  const [newTimeLockPeriod, setNewTimeLockPeriod] = useState('')
  const [selectedTxId, setSelectedTxId] = useState('')

  const { session, connect, disconnect } = useSingleWallet()
  const [isRecoveryWalletConnected, setIsRecoveryWalletConnected] = useState(false)
  const [showConnectRecoveryDialog, setShowConnectRecoveryDialog] = useState(false)

  useEffect(() => {
    if (!isConnected) {
      navigate('/')
      return
    }

    if (!address) {
      navigate('/security-center')
      return
    }

    // Validate address format before attempting to load
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError('Invalid contract address format')
      setLoading(false)
      return
    }

    loadContractInfo()
  }, [isConnected, address])

  useEffect(() => {
    if (session && contractInfo) {
      setIsRecoveryWalletConnected(
        session.account.toLowerCase() === contractInfo.recoveryAddress.toLowerCase()
      )
    } else {
      setIsRecoveryWalletConnected(false)
    }
  }, [session, contractInfo])

  const loadContractInfo = async () => {
    if (!address) return

    setLoading(true)
    setError(null)

    try {
      const info = await validateAndLoadContract(address as `0x${string}`)
      setContractInfo(info)
    } catch (error) {
      console.error('Error loading contract:', error)
      setError('Failed to load contract details. Please ensure this is a valid SecureOwnable contract.')
      toast({
        title: "Loading failed",
        description: "Failed to load contract details. Please ensure this is a valid SecureOwnable contract.",
        variant: "destructive"
      })
    }
    
    setLoading(false)
  }

  // Action handlers
  const handleTransferOwnershipRequest = async () => {
    if (!contractInfo) return

    try {
      if (!session) {
        setShowConnectRecoveryDialog(true)
        return
      }

      if (!isRecoveryWalletConnected) {
        // If wrong wallet is connected, disconnect it first
        await disconnect()
        setShowConnectRecoveryDialog(true)
        return
      }

      // Implementation with connected recovery wallet
      toast({
        title: "Request submitted",
        description: "Transfer ownership request has been submitted.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit transfer ownership request.",
        variant: "destructive"
      })
    }
  }

  const handleTransferOwnershipApproval = async (txId: string) => {
    try {
      // Implementation
      toast({
        title: "Approval submitted",
        description: "Transfer ownership approval has been submitted.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve transfer ownership.",
        variant: "destructive"
      })
    }
  }

  const handleTransferOwnershipCancellation = async (txId: string) => {
    try {
      // Implementation
      toast({
        title: "Cancellation submitted",
        description: "Transfer ownership cancellation has been submitted.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel transfer ownership.",
        variant: "destructive"
      })
    }
  }

  const handleUpdateBroadcasterRequest = async (newBroadcaster: string) => {
    try {
      // Implementation
      toast({
        title: "Request submitted",
        description: "Broadcaster update request has been submitted.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit broadcaster update request.",
        variant: "destructive"
      })
    }
  }

  const handleUpdateBroadcasterApproval = async (txId: string) => {
    try {
      // Implementation
      toast({
        title: "Approval submitted",
        description: "Broadcaster update approval has been submitted.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve broadcaster update.",
        variant: "destructive"
      })
    }
  }

  const handleUpdateBroadcasterCancellation = async (txId: string) => {
    try {
      // Implementation
      toast({
        title: "Cancellation submitted",
        description: "Broadcaster update cancellation has been submitted.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel broadcaster update.",
        variant: "destructive"
      })
    }
  }

  const handleUpdateRecoveryRequest = async (newRecovery: string) => {
    try {
      // Implementation
      toast({
        title: "Request submitted",
        description: "Recovery address update request has been submitted.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit recovery address update request.",
        variant: "destructive"
      })
    }
  }

  const handleUpdateTimeLockRequest = async (newPeriod: string) => {
    try {
      // Implementation
      toast({
        title: "Request submitted",
        description: "Time lock period update request has been submitted.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit time lock period update request.",
        variant: "destructive"
      })
    }
  }

  const RecoveryWalletDialog = () => {
    const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID;
    if (!projectId) {
      throw new Error('Missing VITE_WALLET_CONNECT_PROJECT_ID environment variable');
    }

    return (
      <Dialog open={showConnectRecoveryDialog} onOpenChange={setShowConnectRecoveryDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Recovery Wallet</DialogTitle>
            <DialogDescription>
              Please connect the recovery wallet to proceed with the ownership transfer request.
              {contractInfo && (
                <div className="mt-2 p-2 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Recovery Address:</p>
                  <code className="text-xs">{contractInfo.recoveryAddress}</code>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <SingleWalletManagerProvider
            projectId={projectId}
            autoConnect={false}
            metadata={{
              name: 'OpenBlox Recovery',
              description: 'OpenBlox Recovery Wallet Connection',
              url: window.location.origin,
              icons: ['https://avatars.githubusercontent.com/u/37784886']
            }}
          >
            <RecoveryWalletContent 
              contractInfo={contractInfo}
              onSuccess={() => {
                setShowConnectRecoveryDialog(false)
                handleTransferOwnershipRequest()
              }}
              onClose={() => setShowConnectRecoveryDialog(false)}
            />
          </SingleWalletManagerProvider>
        </DialogContent>
      </Dialog>
    )
  }

  if (!address || error) {
    return (
      <div className="container py-8">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <Button
              variant="ghost"
              onClick={() => navigate('/security-center')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Security Center
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </motion.div>
        </motion.div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container py-8">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </motion.div>
        </motion.div>
      </div>
    )
  }

  if (!contractInfo) {
    return (
      <div className="container py-8">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <Button
              variant="ghost"
              onClick={() => navigate('/security-center')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Security Center
            </Button>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Contract not found or not a valid SecureOwnable contract.</AlertDescription>
            </Alert>
          </motion.div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col space-y-8"
      >
        {/* Header */}
        <motion.div variants={item} className="flex items-center justify-start">
          <div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/security-center')}
                className="mr-4"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-left">Security Details</h1>
                <p className="mt-2 text-muted-foreground">
                  Manage security settings for contract at {address}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Contract Info */}
        <motion.div variants={item} className="grid gap-6">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Contract Information</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Owner</p>
                  <p className="font-medium">{contractInfo.owner}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Broadcaster</p>
                  <p className="font-medium">{contractInfo.broadcaster}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Recovery Address</p>
                  <p className="font-medium">{contractInfo.recoveryAddress}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Timelock Period</p>
                  <p className="font-medium">{contractInfo.timeLockPeriodInDays} days</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Ownership Management */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Key className="h-5 w-5" />
              Ownership Management
            </h2>
            <div className="space-y-4">
              <Button 
                onClick={handleTransferOwnershipRequest}
                className="flex items-center gap-2"
              >
                <Wallet className="h-4 w-4" />
                Request Ownership Transfer
              </Button>

              <div className="flex gap-2">
                <Input
                  placeholder="Transaction ID"
                  value={selectedTxId}
                  onChange={(e) => setSelectedTxId(e.target.value)}
                />
                <Button onClick={() => handleTransferOwnershipApproval(selectedTxId)}>
                  Approve Transfer
                </Button>
                <Button variant="destructive" onClick={() => handleTransferOwnershipCancellation(selectedTxId)}>
                  Cancel Transfer
                </Button>
              </div>
            </div>
          </Card>

          {/* Broadcaster Management */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Broadcaster Management
            </h2>
            <div className="space-y-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Request Broadcaster Update
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Request Broadcaster Update</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="New Broadcaster Address"
                      value={newBroadcasterAddress}
                      onChange={(e) => setNewBroadcasterAddress(e.target.value)}
                    />
                    <div className="p-2 bg-muted rounded-lg">
                      <p className="text-sm font-medium">Current Broadcaster Address:</p>
                      <code className="text-xs">{contractInfo.broadcaster}</code>
                    </div>
                    <SingleWalletManagerProvider
                      projectId={import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID}
                      autoConnect={false}
                      metadata={{
                        name: 'OpenBlox Broadcaster',
                        description: 'OpenBlox Broadcaster Wallet Connection',
                        url: window.location.origin,
                        icons: ['https://avatars.githubusercontent.com/u/37784886']
                      }}
                    >
                      <BroadcasterWalletContent 
                        contractInfo={contractInfo}
                        onSuccess={() => handleUpdateBroadcasterRequest(newBroadcasterAddress)}
                        onClose={() => {}}
                      />
                    </SingleWalletManagerProvider>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {}}>
                        Cancel
                      </Button>
                      <Button onClick={() => handleUpdateBroadcasterRequest(newBroadcasterAddress)}>
                        Submit Request
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex gap-2">
                <Input
                  placeholder="Transaction ID"
                  value={selectedTxId}
                  onChange={(e) => setSelectedTxId(e.target.value)}
                />
                <Button onClick={() => handleUpdateBroadcasterApproval(selectedTxId)}>
                  Approve Update
                </Button>
                <Button variant="destructive" onClick={() => handleUpdateBroadcasterCancellation(selectedTxId)}>
                  Cancel Update
                </Button>
              </div>
            </div>
          </Card>

          {/* Recovery Management */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Recovery Management
            </h2>
            <div className="space-y-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Update Recovery Address</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Recovery Address</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="New Recovery Address"
                      value={newRecoveryAddress}
                      onChange={(e) => setNewRecoveryAddress(e.target.value)}
                    />
                    <Button onClick={() => handleUpdateRecoveryRequest(newRecoveryAddress)}>
                      Submit Request
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </Card>

          {/* TimeLock Management */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              TimeLock Management
            </h2>
            <div className="space-y-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Update TimeLock Period</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update TimeLock Period</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      type="number"
                      placeholder="New TimeLock Period (days)"
                      value={newTimeLockPeriod}
                      onChange={(e) => setNewTimeLockPeriod(e.target.value)}
                    />
                    <Button onClick={() => handleUpdateTimeLockRequest(newTimeLockPeriod)}>
                      Submit Request
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </Card>

          {/* Pending Operations */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Pending Operations</h2>
            <div className="space-y-4">
              {contractInfo.pendingOperations && contractInfo.pendingOperations.length > 0 ? (
                contractInfo.pendingOperations.map((op, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-yellow-500/10 p-2">
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      </div>
                      <div>
                        <p className="font-medium">{op.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {op.details?.remainingTime
                            ? `${Math.floor(op.details.remainingTime / 86400)} days remaining`
                            : 'Ready for approval'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        Approve
                      </Button>
                      <Button variant="outline" size="sm">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No pending operations
                </p>
              )}
            </div>
          </Card>

          {/* Operation History */}
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Operation History</h2>
            <div className="space-y-4">
              {contractInfo.recentEvents && contractInfo.recentEvents.length > 0 ? (
                contractInfo.recentEvents.map((event, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className={`rounded-full p-2 ${
                      event.status === 'completed' ? 'bg-green-500/10' :
                      event.status === 'pending' ? 'bg-yellow-500/10' :
                      'bg-red-500/10'
                    }`}>
                      {event.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : event.status === 'pending' ? (
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{event.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.status === 'completed'
                          ? `${event.type.charAt(0).toUpperCase() + event.type.slice(1)} updated successfully`
                          : `${event.type.charAt(0).toUpperCase() + event.type.slice(1)} operation cancelled`}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(event.timestamp * 1000).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No operation history
                </p>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Recovery Wallet Connection Dialog */}
        <RecoveryWalletDialog />
      </motion.div>
    </div>
  )
} 