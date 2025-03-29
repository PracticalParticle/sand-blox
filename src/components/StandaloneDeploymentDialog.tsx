import { useState, type ChangeEvent } from 'react'
import { useChainId, useConfig, useWalletClient } from 'wagmi'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'
import { useStandaloneDeployment } from '../lib/deployment/standalone'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Input } from './ui/input'

interface StandaloneDeploymentDialogProps {
  isOpen: boolean
  onClose: () => void
  initialCode?: string
}

export function StandaloneDeploymentDialog({ 
  isOpen, 
  onClose, 
  initialCode = '' 
}: StandaloneDeploymentDialogProps) {
  const chainId = useChainId()
  const config = useConfig()
  const [deploymentStarted, setDeploymentStarted] = useState(false)
  const [code, setCode] = useState(initialCode)
  const [constructorArgs, setConstructorArgs] = useState<string>('')
  const [libraries, setLibraries] = useState<string>('')
  
  const { data: walletClient } = useWalletClient()

  const {
    deploy,
    isLoading,
    isError,
    error,
    isSuccess,
    hash,
  } = useStandaloneDeployment({
    solidityCode: code,
    constructorArgs: constructorArgs ? JSON.parse(constructorArgs) : [],
    libraries: libraries ? JSON.parse(libraries) : {},
  })

  const handleDeploy = async () => {
    setDeploymentStarted(true)
    try {
      if (!walletClient) {
        throw new Error("Wallet client is not available")
      }
      await deploy()
      console.log("Transaction sent")
    } catch (err) {
      console.error("Deployment error:", err)
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deploy Contract</DialogTitle>
          <DialogDescription>
            Deploy a Solidity contract directly to {getChainName()}. Make sure you have enough funds to cover the gas fees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!deploymentStarted ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Contract Code</Label>
                <Textarea
                  id="code"
                  value={code}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCode(e.target.value)}
                  placeholder="pragma solidity ^0.8.0;

contract MyContract {
    // Your contract code here
}"
                  className="font-mono h-[300px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="args">Constructor Arguments (JSON array)</Label>
                <Input
                  id="args"
                  value={constructorArgs}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setConstructorArgs(e.target.value)}
                  placeholder="[]"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="libraries">Libraries (JSON object)</Label>
                <Input
                  id="libraries"
                  value={libraries}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setLibraries(e.target.value)}
                  placeholder="{}"
                  className="font-mono"
                />
              </div>

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
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <div className="text-center">
                    <p className="font-semibold">Deployment Successful!</p>
                    <p className="text-sm text-muted-foreground">
                      Your contract has been deployed successfully.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={onClose}>
                      Close
                    </Button>
                    <Button asChild>
                      <a
                        href={getExplorerLink()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View on Explorer
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 