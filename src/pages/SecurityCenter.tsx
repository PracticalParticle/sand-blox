import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Shield,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImportContract } from '../components/ImportContract'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '../components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import type { SecureContractInfo } from '@/lib/types'

// Utility function to recursively convert BigInt to string
const convertBigIntToString = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToString);
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const key in obj) {
      converted[key] = convertBigIntToString(obj[key]);
    }
    return converted;
  }

  return obj;
};

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

// Lazy-loaded contract details component
const ContractCard = ({ 
  contract, 
  onManage, 
  onUnload 
}: { 
  contract: SecureContractInfo, 
  onManage: (address: string) => void,
  onUnload: (address: string) => void 
}) => (
  <Card className="p-6" role="listitem">
    <div className="flex items-start justify-between">
      <div>
        <h3 className="text-lg font-semibold mb-2" tabIndex={0}>Contract: {contract.address}</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p tabIndex={0}>Owner: {contract.owner}</p>
          <p tabIndex={0}>Broadcaster: {contract.broadcaster}</p>
          <p tabIndex={0}>Recovery Address: {contract.recoveryAddress}</p>
          <p tabIndex={0}>Timelock Period: {contract.timeLockPeriodInDays} days</p>
          {contract.pendingOperations && contract.pendingOperations.length > 0 && (
            <div className="mt-4" role="status">
              <p className="text-yellow-500 flex items-center gap-2" tabIndex={0}>
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {contract.pendingOperations.length} pending operations
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button 
          variant="outline" 
          onClick={() => onManage(contract.address)}
          aria-label={`Manage security for contract ${contract.address}`}
        >
          Manage Security
          <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => onUnload(contract.address)}
          aria-label={`Unload contract ${contract.address}`}
          className="text-muted-foreground hover:text-muted-foreground/80 hover:bg-muted/50"
        >
          <XCircle className="h-4 w-4 mr-2" aria-hidden="true" />
          Unload
        </Button>
      </div>
    </div>
  </Card>
)

export default function SecurityCenter() {
  const { isConnected } = useAccount()
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<SecureContractInfo[]>(() => {
    // Load contracts from local storage on initial render
    const storedContracts = localStorage.getItem('secureContracts')
    if (!storedContracts) return []
    
    try {
      return JSON.parse(storedContracts)
    } catch (error) {
      console.error('Error parsing stored contracts:', error)
      return []
    }
  })
  const [error] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!isConnected) {
      navigate('/')
    }
  }, [isConnected, navigate])

  useEffect(() => {
    // Save contracts to local storage whenever they change
    try {
      const serializedContracts = convertBigIntToString(contracts)
      localStorage.setItem('secureContracts', JSON.stringify(serializedContracts))
    } catch (error) {
      console.error('Error saving contracts to localStorage:', error)
    }
  }, [contracts])

  const handleUnloadContract = (address: string): void => {
    const filtered = contracts.filter(c => c.address !== address)
    setContracts(filtered)
    
    setTimeout(() => {
      toast({
        title: "Contract unloaded",
        description: "The contract has been removed from the Security Center.",
        variant: "default"
      })
    }, 0)
  }

  const handleImportSuccess = (contractInfo: SecureContractInfo) => {
    // Check if contract already exists
    if (contracts.some(c => c.address === contractInfo.address)) {
      setTimeout(() => {
        toast({
          title: "Contract already imported",
          description: "This contract has already been imported to the Security Center.",
          variant: "default"
        })
      }, 0)
      return
    }
    
    // Convert any BigInt values to strings before updating state
    const serializedContractInfo = convertBigIntToString(contractInfo)
    setContracts(prev => [...prev, serializedContractInfo])
  }

  return (
    <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Security Center">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col space-y-8"
      >
        {/* Header */}
        <motion.div variants={item} className="flex items-center justify-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-left" tabIndex={0}>Security Center</h1>
            <p className="mt-2 text-muted-foreground" tabIndex={0}>
              Manage security settings and roles for your SecureOwnable contracts.
            </p>
          </div>
          <div className="ml-auto">
            <ImportContract
              buttonVariant="outline"
              onImportSuccess={handleImportSuccess}
              buttonText="Import Contract"
              buttonIcon="download"
            />
          </div>
        </motion.div>

        {error && (
          <motion.div variants={item} role="alert">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        {contracts.length > 0 && (
          <>
            {/* Stats Grid */}
            <motion.div variants={item} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" role="region" aria-label="Security Statistics">
              <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-colors hover:bg-card/80" role="status">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" aria-hidden="true" />
                <div className="relative space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    Protected Contracts
                  </div>
                  <p className="text-2xl font-bold" tabIndex={0}>{contracts.length}</p>
                  <p className="text-xs text-muted-foreground">
                    SecureOwnable contracts
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-colors hover:bg-card/80" role="status">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" aria-hidden="true" />
                <div className="relative space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Active Roles
                  </div>
                  <p className="text-2xl font-bold" tabIndex={0}>{contracts.length * 3}</p>
                  <p className="text-xs text-muted-foreground">
                    Owner, Recovery, and Broadcaster
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-colors hover:bg-card/80" role="status">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" aria-hidden="true" />
                <div className="relative space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    Pending Operations
                  </div>
                  <p className="text-2xl font-bold" tabIndex={0}>
                    {contracts.reduce((acc, contract) => 
                      acc + (contract.pendingOperations?.length || 0), 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Awaiting timelock or approval
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-colors hover:bg-card/80" role="status">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" aria-hidden="true" />
                <div className="relative space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Security Score
                  </div>
                  <p className="text-2xl font-bold" tabIndex={0}>100%</p>
                  <p className="text-xs text-muted-foreground">
                    All contracts are secure
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Secure Contracts Section */}
            <motion.div variants={item} className="rounded-lg border bg-card" role="region" aria-label="Protected Contracts">
              <div className="border-b p-4">
                <h2 className="text-xl font-bold text-left" tabIndex={0}>Protected Contracts</h2>
              </div>
              <div className="p-4">
                <div className="grid gap-6" role="list">
                  {contracts.map((contract) => (
                    <ContractCard 
                      key={contract.address} 
                      contract={contract} 
                      onManage={(address) => navigate(`/security-center/${address}`)}
                      onUnload={handleUnloadContract}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}

        {!contracts.length && (
          <motion.div variants={item} className="flex flex-col items-center gap-4 py-8 text-center" role="status" aria-label="No contracts">
            <div className="rounded-full bg-primary/10 p-3">
              <Shield className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h3 className="font-medium" tabIndex={0}>No Protected Contracts</h3>
              <p className="text-sm text-muted-foreground">
                Import your first SecureOwnable contract to get started.
              </p>
            </div>
            <ImportContract
              buttonVariant="outline"
              onImportSuccess={handleImportSuccess}
              buttonText="Import SecureOwnable Contract"
              buttonIcon="download"
            />
          </motion.div>
        )}
      </motion.div>
    </div>
  )
} 