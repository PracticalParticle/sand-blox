import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'
import { useContractDeployment } from '../lib/deployment'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useChainId, useConfig, useWalletClient, useAccount } from 'wagmi'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { isAddress } from 'viem'
import { env } from '@/config/env'
import { useDeployedContract } from '@/contexts/DeployedContractContext'
import type { SecureContractInfo } from '@/lib/types'

interface DeploymentDialogProps {
  isOpen: boolean
  onClose: () => void
  contractId: string
  contractName: string
}

interface FormData {
  initialOwner: string
  broadcaster: string
  recovery: string
  timeLockPeriod: string
  timeUnit: 'days' | 'hours' | 'minutes'
}

export function DeploymentDialog({ 
  isOpen, 
  onClose, 
  contractId, 
  contractName
}: DeploymentDialogProps) {
  const chainId = useChainId()
  const config = useConfig()
  const { address } = useAccount()
  const [deploymentStarted, setDeploymentStarted] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    initialOwner: address || '',
    broadcaster: '',
    recovery: '',
    timeLockPeriod: '1',
    timeUnit: 'days'
  })
  const [formErrors, setFormErrors] = useState<Partial<FormData>>({})
  const { addDeployedContract } = useDeployedContract()
  const [contractAdded, setContractAdded] = useState(false)
  
  const { data: walletClient } = useWalletClient()

  const {
    deploy,
    isLoading,
    isError,
    error,
    isSuccess,
    hash,
    address: contractAddress,
  } = useContractDeployment({
    contractId,
    libraries: {
      MultiPhaseSecureOperation: env.VITE_LIBRARY_MULTI_PHASE_SECURE_OPERATION as `0x${string}`
    }
  })

  const convertToMinutes = (value: string, unit: 'days' | 'hours' | 'minutes'): number => {
    const numValue = parseInt(value)
    switch (unit) {
      case 'days':
        return numValue * 24 * 60
      case 'hours':
        return numValue * 60
      case 'minutes':
        return numValue
      default:
        return numValue * 24 * 60 // default to days
    }
  }

  useEffect(() => {
    if (isSuccess && contractAddress && !contractAdded) {
      const contractInfo: SecureContractInfo = {
        contractAddress: contractAddress,
        timeLockPeriodInMinutes: convertToMinutes(formData.timeLockPeriod, formData.timeUnit),
        chainId,
        chainName: getChainName(),
        broadcaster: formData.broadcaster,
        owner: formData.initialOwner,
        recoveryAddress: formData.recovery,
        contractType: contractId,
        contractName: contractName
      }
      
      addDeployedContract(contractInfo)
      setContractAdded(true)
    }
  }, [isSuccess, contractAddress, formData, chainId, contractId, contractName, addDeployedContract, contractAdded])

  useEffect(() => {
    if (!isOpen) {
      setContractAdded(false)
    }
  }, [isOpen])

  const validateForm = () => {
    const errors: Partial<FormData> = {}
    
    if (!isAddress(formData.initialOwner)) {
      errors.initialOwner = 'Invalid address'
    }
    if (!isAddress(formData.broadcaster)) {
      errors.broadcaster = 'Invalid address'
    }
    if (!isAddress(formData.recovery)) {
      errors.recovery = 'Invalid address'
    }
    
    const value = parseInt(formData.timeLockPeriod)
    const minMinutes = 24 * 60 // 1 day in minutes
    
    if (isNaN(value) || value < 1) {
      errors.timeLockPeriod = 'Must be a positive number'
    } else {
      const totalMinutes = convertToMinutes(formData.timeLockPeriod, formData.timeUnit)
      if (totalMinutes < minMinutes) {
        errors.timeLockPeriod = 'Minimum time lock period is 1 day'
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleDeploy = async () => {
    if (!validateForm()) return
    
    setDeploymentStarted(true)
    try {
      if (!walletClient) {
        throw new Error("Wallet client is not available")
      }
      
      const params = contractId === 'simple-vault' ? [
        formData.initialOwner,
        formData.broadcaster,
        formData.recovery,
        convertToMinutes(formData.timeLockPeriod, formData.timeUnit)
      ] : [];

      await deploy(params)
      
      console.log("Transaction sent")
    } catch (err) {
      console.error("[DeploymentDialog] Deployment error:", {
        error: err,
        contractId,
        chainId,
        chainName: getChainName()
      });
      setDeploymentStarted(false)
    }
  }

  const getExplorerLink = () => {
    if (!hash) return '#'
    const chain = config.chains.find(c => c.id === chainId)
    if (!chain?.blockExplorers?.default?.url) return '#'
    return `${chain.blockExplorers.default.url}/tx/${hash}`
  }

  const getChainName = () => {
    const chain = config.chains.find(c => c.id === chainId)
    return chain?.name || 'the current network'
  }

  const renderFormFields = () => {
    // Only show form fields for SimpleVault contract
    if (contractId !== 'simple-vault') return null;

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="initialOwner">Initial Owner</Label>
          <Input
            id="initialOwner"
            value={formData.initialOwner}
            onChange={(e) => setFormData(prev => ({ ...prev, initialOwner: e.target.value }))}
            placeholder="0x..."
          />
          {formErrors.initialOwner && (
            <p className="text-sm text-destructive">{formErrors.initialOwner}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="broadcaster">Broadcaster</Label>
          <Input
            id="broadcaster"
            value={formData.broadcaster}
            onChange={(e) => setFormData(prev => ({ ...prev, broadcaster: e.target.value }))}
            placeholder="0x..."
          />
          {formErrors.broadcaster && (
            <p className="text-sm text-destructive">{formErrors.broadcaster}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recovery">Recovery Address</Label>
          <Input
            id="recovery"
            value={formData.recovery}
            onChange={(e) => setFormData(prev => ({ ...prev, recovery: e.target.value }))}
            placeholder="0x..."
          />
          {formErrors.recovery && (
            <p className="text-sm text-destructive">{formErrors.recovery}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeLockPeriod">Time Lock Period</Label>
          <div className="flex space-x-2">
            <Input
              id="timeLockPeriod"
              type="number"
              min="1"
              className="flex-1"
              value={formData.timeLockPeriod}
              onChange={(e) => setFormData(prev => ({ ...prev, timeLockPeriod: e.target.value }))}
            />
            <select
              id="timeUnit"
              value={formData.timeUnit}
              onChange={(e) => setFormData(prev => ({ ...prev, timeUnit: e.target.value as 'days' | 'hours' | 'minutes' }))}
              className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="days">Days</option>
              <option value="hours">Hours</option>
              <option value="minutes">Minutes</option>
            </select>
          </div>
          {formErrors.timeLockPeriod && (
            <p className="text-sm text-destructive">{formErrors.timeLockPeriod}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Deploy {contractName}</DialogTitle>
          <DialogDescription>
            Deploy this contract to the current network. Make sure you have enough funds to cover the gas fees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!deploymentStarted ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You are about to deploy the {contractName} contract to {getChainName()}.
                {contractId === 'simple-vault' && " Please configure the constructor parameters below."}
              </p>

              {renderFormFields()}

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleDeploy}>
                  Deploy Contract
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {isLoading && (
                <div className="flex flex-col items-center justify-center space-y-4 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Deploying contract...
                  </p>
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center justify-center space-y-4 py-8">
                  <XCircle className="h-8 w-8 text-destructive" />
                  <div className="text-center">
                    <p className="font-semibold">Deployment Failed</p>
                    <p className="text-sm text-muted-foreground">
                      {error?.message || 'Something went wrong during deployment.'}
                    </p>
                  </div>
                  <Button variant="outline" onClick={onClose}>
                    Close
                  </Button>
                </div>
              )}

              {isSuccess && (
                <div className="flex flex-col items-center justify-center space-y-4 py-8">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                  <div className="text-center">
                    <p className="font-semibold">Deployment Successful</p>
                    <p className="text-sm text-muted-foreground">
                      Your contract has been deployed successfully.
                    </p>
                    <p className="mt-2 font-mono text-sm break-all">
                      Contract Address: {contractAddress}
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
                  <Button variant="outline" onClick={onClose}>
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
        </div>
      </DialogContent>
    </Dialog>
  )
} 