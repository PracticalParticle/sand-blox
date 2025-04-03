import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DeploymentForm } from '../../SimpleRWA20/components/DeploymentForm'
import { useWriteContract, useWaitForTransactionReceipt, useConfig, useChainId } from 'wagmi'
import { Address, decodeEventLog } from 'viem'
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useDeployedContract } from '@/contexts/DeployedContractContext'
import type { SecureContractInfo } from '@/lib/types'
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle } from 'lucide-react'

const factoryABI = [
  {
    name: 'createBlox',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_name', type: 'string' },
      { name: '_symbol', type: 'string' },
      { name: '_owner', type: 'address' },
      { name: '_broadcaster', type: 'address' },
      { name: '_recovery', type: 'address' },
      { name: '_timeLockPeriodInMinutes', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'BloxCreated',
    type: 'event',
    inputs: [
      { name: 'bloxAddress', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true }
    ]
  }
] as const

interface SimpleRWA20FactoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  factoryAddress: Address
}

function SimpleRWA20FactoryDialog({ open, onOpenChange, factoryAddress }: SimpleRWA20FactoryDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hash, setHash] = useState<`0x${string}` | undefined>(undefined)
  const [deployedAddress, setDeployedAddress] = useState<Address | null>(null)
  const [contractAdded, setContractAdded] = useState(false)
  const { writeContractAsync } = useWriteContract()
  const { addDeployedContract } = useDeployedContract()
  const chainId = useChainId()
  const config = useConfig()

  // Wait for transaction receipt and extract deployed contract address from events
  const { isLoading: isWaiting, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash
  })

  // Process the receipt when it arrives
  useEffect(() => {
    if (receipt && isSuccess) {
      console.log('Transaction receipt received:', receipt)
      console.log('Factory address:', factoryAddress)
      
      try {
        // Find logs from our factory contract
        const factoryLogs = receipt.logs.filter(log => 
          log.address.toLowerCase() === factoryAddress.toLowerCase()
        )
        
        console.log('Found factory logs:', factoryLogs)
        
        // Try to find and decode the BloxCreated event
        for (const log of factoryLogs) {
          try {
            console.log('Attempting to decode log:', {
              address: log.address,
              topics: log.topics,
              data: log.data
            })

            // Try to decode the log as our BloxCreated event
            const decodedLog = decodeEventLog({
              abi: factoryABI,
              data: log.data,
              topics: log.topics
            })
            
            console.log('Successfully decoded log:', decodedLog)
            
            // Check if this is our BloxCreated event
            if (decodedLog.eventName === 'BloxCreated') {
              const bloxAddress = decodedLog.args.bloxAddress as Address
              console.log('Found deployed SimpleRWA20 address:', bloxAddress)
              setDeployedAddress(bloxAddress)
              return // Exit once we find the event
            }
          } catch (decodeErr) {
            console.log('Failed to decode log:', decodeErr)
            continue
          }
        }
        
        // If we get here, we didn't find the event
        console.warn('No BloxCreated event found. All transaction logs:', receipt.logs)
      } catch (err) {
        console.error('Error processing transaction receipt:', err)
        setError('Failed to process deployment result: ' + (err as Error).message)
      }
    }
  }, [receipt, isSuccess, factoryAddress])

  // Add the deployed contract to the list when deployment is successful
  useEffect(() => {
    console.log('Contract addition effect triggered:', {
      isSuccess,
      deployedAddress,
      contractAdded,
      lastUsedParams: lastUsedParams.current
    })

    if (isSuccess && deployedAddress && !contractAdded && lastUsedParams.current) {
      try {
        const contractInfo: SecureContractInfo = {
          contractAddress: deployedAddress,
          timeLockPeriodInMinutes: lastUsedParams.current.timeLockPeriodInMinutes,
          chainId,
          chainName: getChainName(),
          broadcaster: lastUsedParams.current.broadcaster,
          owner: lastUsedParams.current.initialOwner,
          recoveryAddress: lastUsedParams.current.recovery,
          contractType: 'simple-rwa20',
          contractName: lastUsedParams.current.name // Use the token name as contract name
        }
        
        console.log('Adding contract to list:', contractInfo)
        addDeployedContract(contractInfo)
        setContractAdded(true)
        
        // Close the dialog after successful addition
        onOpenChange(false)
      } catch (err) {
        console.error('Error adding contract to list:', err)
        setError('Failed to add contract to list: ' + (err as Error).message)
      }
    }
  }, [isSuccess, deployedAddress, chainId, addDeployedContract, contractAdded, onOpenChange])

  // Reset states when dialog closes
  useEffect(() => {
    if (!open) {
      setContractAdded(false)
      setHash(undefined)
      setDeployedAddress(null)
      setError(null)
    }
  }, [open])

  // Store last used params for adding to deployed contracts list
  const lastUsedParams = useRef<{
    name: string,
    symbol: string,
    initialOwner: Address,
    broadcaster: Address,
    recovery: Address,
    timeLockPeriodInMinutes: number
  } | null>(null)

  const getChainName = () => {
    const chain = config.chains.find(c => c.id === chainId)
    return chain?.name || 'the current network'
  }

  const getExplorerLink = () => {
    if (!hash) return '#'
    const chain = config.chains.find(c => c.id === chainId)
    if (!chain?.blockExplorers?.default?.url) return '#'
    return `${chain.blockExplorers.default.url}/tx/${hash}`
  }

  const handleDeploy = async (params: {
    name: string,
    symbol: string,
    initialOwner: Address,
    broadcaster: Address,
    recovery: Address,
    timeLockPeriodInDays: number
  }) => {
    try {
      setError(null)
      setIsLoading(true)

      // Convert days to minutes for the contract
      const timeLockPeriodInMinutes = params.timeLockPeriodInDays * 24 * 60

      // Store params for later use
      lastUsedParams.current = {
        ...params,
        timeLockPeriodInMinutes
      }

      // Log the factory address and parameters
      console.log('Deploying SimpleRWA20 via factory:')
      console.log('Factory Address:', factoryAddress)
      console.log('Transaction Parameters:', {
        name: params.name,
        symbol: params.symbol,
        initialOwner: params.initialOwner,
        broadcaster: params.broadcaster,
        recovery: params.recovery,
        timeLockPeriodInDays: params.timeLockPeriodInDays,
        timeLockPeriodInMinutes
      })

      // Send the transaction
      const txHash = await writeContractAsync({
        abi: factoryABI,
        address: factoryAddress,
        functionName: 'createBlox',
        args: [
          params.name,
          params.symbol,
          params.initialOwner,
          params.broadcaster,
          params.recovery,
          BigInt(timeLockPeriodInMinutes)
        ]
      })
      
      console.log('Transaction hash:', txHash)
      setHash(txHash)
      console.log('Transaction submitted successfully:', txHash)
    } catch (err) {
      console.error('Factory deployment error:', err)
      setError((err as Error).message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      // Only allow closing if we're not in a loading state
      if (!isLoading && !isWaiting) {
        onOpenChange(isOpen)
      }
    }}>
      <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deploy SimpleRWA20 via Factory</DialogTitle>
          <DialogDescription>
            Deploy a new SimpleRWA20 token contract using the factory contract.
          </DialogDescription>
        </DialogHeader>

        {!hash ? (
          <>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DeploymentForm
              onDeploy={handleDeploy}
              isLoading={isLoading}
            />
          </>
        ) : (
          <div className="space-y-4 py-4">
            {(isLoading || isWaiting) && (
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  {isWaiting ? "Waiting for transaction confirmation..." : "Deploying contract..."}
                </p>
              </div>
            )}

            {isSuccess && deployedAddress && (
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <CheckCircle2 className="h-8 w-8 text-primary" />
                <div className="text-center">
                  <p className="font-semibold">Deployment Successful</p>
                  <p className="text-sm text-muted-foreground">
                    Your SimpleRWA20 token has been deployed successfully.
                  </p>
                  <p className="mt-2 font-mono text-sm break-all">
                    Contract Address: {deployedAddress}
                  </p>
                  <a
                    href={getExplorerLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-sm text-primary hover:underline"
                  >
                    View on Explorer
                  </a>
                </div>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <XCircle className="h-8 w-8 text-destructive" />
                <div className="text-center">
                  <p className="font-semibold">Deployment Failed</p>
                  <p className="text-sm text-muted-foreground">
                    {error}
                  </p>
                </div>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            By deploying this contract, you agree to our 
            <br />
            <a href="/privacy" target="_blank" className="text-blue-500 underline"> Privacy Policy</a> and 
            <a href="/terms" target="_blank" className="text-blue-500 underline"> Terms and Conditions</a>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SimpleRWA20FactoryDialog
