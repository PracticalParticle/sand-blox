import { useParams, Link } from 'react-router-dom'
import { useAccount, useChainId } from 'wagmi'
import { useState, useEffect } from 'react'
import { Loader2, Plus, ArrowLeft, FileText, Code, Info, Shield, ChevronRight } from 'lucide-react'
import { getContractDetails, getContractCode } from '../lib/catalog'
import type { BloxContract } from '../lib/catalog/types'
import Prism from 'prismjs'
import 'prismjs/components/prism-solidity'
import 'prismjs/themes/prism-tomorrow.css'
import { DeploymentDialog } from '../components/DeploymentDialog'
import { Button } from '../components/ui/button'
import ReactMarkdown from 'react-markdown'
import { Address } from 'viem'
import { motion } from 'framer-motion'
import { Badge } from '../components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

// Animation variants
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

// Custom styles for the code block
const codeBlockStyle = {
  background: 'transparent',
  fontSize: '0.875rem',
  lineHeight: 1.5,
  margin: 0,
  padding: 0,
}

export function ContractDetails() {
  const { contractId } = useParams<{ contractId: string }>()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const [contract, setContract] = useState<BloxContract | null>(null)
  const [contractCode, setContractCode] = useState<string>('')
  const [markdownContent, setMarkdownContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeployDialog, setShowDeployDialog] = useState(false)

  const [showCodeDialog, setShowCodeDialog] = useState(false)
  const [showFactoryDialog, setShowFactoryDialog] = useState(false)
  const [FactoryDialog, setFactoryDialog] = useState<any>(null)
  const [factoryAddress, setFactoryAddress] = useState<Address | undefined>(undefined)
  
  // Check if a factory is available for the current chain
  const hasFactory = !!contract?.deployments?.[chainId.toString()]?.factory

  useEffect(() => {
    if (contractId) {
      setLoading(true)
      setError(null)

      Promise.all([
        getContractDetails(contractId),
        getContractCode(contractId),
      ])
        .then(async ([details, code]) => {
          setContract(details)
          setContractCode(code)
          
          // Fetch the markdown content from the docs path
          try {
            if (details && details.files && details.files.docs) {
              const response = await fetch(details.files.docs)
              if (response.ok) {
                const markdown = await response.text()
                setMarkdownContent(markdown)
              } else {
                console.error('Failed to load markdown content:', response.statusText)
              }
            }
          } catch (err) {
            console.error('Error loading markdown content:', err)
          }
          
          // Highlight the code after it's loaded
          setTimeout(() => {
            Prism.highlightAll()
          }, 0)
        })
        .catch(err => {
          console.error(err)
          setError('Failed to load contract details')
        })
        .finally(() => setLoading(false))
    }
  }, [contractId])

  // Highlight code when dialog is opened
  useEffect(() => {
    if (showCodeDialog) {
      setTimeout(() => {
        Prism.highlightAll()
      }, 100)
    }
  }, [showCodeDialog])

  // Handle dialog close
  const handleCloseDeployDialog = () => {
    setShowDeployDialog(false)
  }

  const handleCreateClick = async () => {
    if (!contract || !hasFactory) return;
    
    try {
      console.log('Loading factory dialog from:', contract.files.factoryDialog);
      
      // Set the factory address for the current chain
      const address = contract.deployments?.[chainId.toString()]?.factory as Address;
      setFactoryAddress(address);
      
      // Dynamic import of the factory dialog
      if (contract.files.factoryDialog) {
        const folderName = contract.files.factoryDialog.split('/').slice(-3)[0];
        const module = await import(`@/blox/${folderName}/factory/${folderName}Factory.dialog.tsx`);
        
        if (!module.default) {
          throw new Error(`Factory dialog component not found for ${contract.id}`);
        }
        
        setFactoryDialog(() => module.default);
        setShowFactoryDialog(true);
      }
    } catch (error) {
      console.error('Failed to load factory dialog:', error);
      // Handle error - could add an error state and show message
    }
  };

  if (loading) {
    return (
      <div className="container py-16">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
            <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
          </div>
          <p className="text-lg text-muted-foreground">Loading contract details...</p>
        </div>
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="container py-16">
        <div className="flex flex-col items-center justify-center h-[50vh] space-y-6">
          <div className="rounded-full bg-destructive/10 p-4">
            <Shield className="h-12 w-12 text-destructive" />
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold mb-2">
              {error || 'Contract Not Found'}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {error 
                ? 'There was an error loading the contract details. Please try again later.'
                : 'The contract you\'re looking for doesn\'t exist.'}
            </p>
          </div>
          <Link
            to="/blox-contracts"
            className="inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blox Contracts
          </Link>
        </div>
      </div>
    )
  }

  // Create a shortened version of markdown for the card
    
  // Create a shortened version of the code for the card

  return (
    <div className="container py-16">
      <motion.div 
        variants={container} 
        initial="hidden" 
        animate="show" 
        className="flex flex-col space-y-8"
      >
        {/* Header with gradient */}
        <div className="relative">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
          </div>
          
          <motion.div variants={item} className="relative z-10 flex flex-col space-y-4 p-6 rounded-xl">
            <Link
              to="/blox-contracts"
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blox Contracts
            </Link>
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{contract.name}</h1>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="rounded-full">
                    {contract.category}
                  </Badge>
                  <Badge 
                    className={`
                      rounded-full flex items-center gap-1
                      ${contract.securityLevel === 'Basic' 
                        ? 'bg-blue-500/15 text-blue-500 hover:bg-blue-500/25'
                        : contract.securityLevel === 'Advanced'
                        ? 'bg-purple-500/15 text-purple-500 hover:bg-purple-500/25'
                        : 'bg-orange-500/15 text-orange-500 hover:bg-orange-500/25'
                      }
                    `}
                  >
                    <Shield className="h-3 w-3" />
                    {contract.securityLevel}
                  </Badge>
                </div>
                <p className="text-lg mt-3 text-muted-foreground max-w-3xl">
                  {contract.description}
                </p>
              </div>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        onClick={handleCreateClick}
                        disabled={!hasFactory || !isConnected}
                        className="hero-gradient-button flex items-center gap-2 shadow-lg"
                        size="lg"
                      >
                        <Plus className="h-4 w-4" /> Create New {contract.name}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {(!hasFactory || !isConnected) && (
                    <TooltipContent>
                      {!isConnected 
                        ? 'Connect your wallet to create a new contract' 
                        : 'Factory not available on current network'}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </motion.div>
        </div>

        {/* Feature Cards */}
        <motion.div variants={item} className="grid gap-6 md:grid-cols-2 sm:grid-cols-1">
          <motion.div 
            whileHover={{ y: -5 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            className="space-y-4 bg-card p-6 rounded-xl border gradient-border shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2">
                <Info className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Features</h2>
            </div>
            <div className="space-y-3">
              {contract.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-primary/10 p-1">
                    <ChevronRight className="h-3 w-3 text-primary" />
                  </div>
                  <p className="text-muted-foreground">{feature}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            className="space-y-4 bg-card p-6 rounded-xl border gradient-border shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Requirements</h2>
            </div>
            <div className="space-y-3">
              {contract.requirements.map((requirement, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-primary/10 p-1">
                    <ChevronRight className="h-3 w-3 text-primary" />
                  </div>
                  <p className="text-muted-foreground">{requirement}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
        {/* Advanced Developer Section (Subtle, Bottom) */}
        <motion.div variants={item} className="mt-8 flex justify-end">
          <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2 text-muted-foreground">
                <Code className="h-4 w-4" /> Developer Resources
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] md:max-w-[900px] max-h-[90vh] w-[95vw] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Developer Resources</DialogTitle>
                <DialogDescription>
                  Advanced resources for {contract.name} development
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-6 sm:grid-cols-1 mt-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-primary/10 p-2">
                      <Code className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium">Contract Code</h3>
                  </div>
                  
                  <div className="relative">
                    <ScrollArea className="h-[40vh] w-full rounded-md border bg-muted/20 p-4">
                      <pre style={{ ...codeBlockStyle, maxWidth: '100%', overflow: 'auto' }}>
                        <code className="language-solidity whitespace-pre-wrap break-all">
                          {contractCode}
                        </code>
                      </pre>
                    </ScrollArea>
                    
                    <div className="absolute top-2 right-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(contractCode);
                        }}
                        className="flex items-center gap-1 h-7 text-xs bg-background/80 backdrop-blur-sm"
                      >
                        <Code className="h-3 w-3" /> Copy
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 w-full">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="w-full">
                            <Button
                              variant="default"
                              className="w-full"
                              disabled={!isConnected}
                              onClick={() => {
                                setShowCodeDialog(false);
                                setTimeout(() => setShowDeployDialog(true), 100);
                              }}
                            >
                              Deploy Contract
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!isConnected && (
                          <TooltipContent>
                            Connect wallet to deploy contract
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>
        {/* Documentation Section (Large, Full-Width) */}
        <motion.div variants={item} className="mt-8">
          <div className="bg-card rounded-xl border gradient-border shadow-sm overflow-hidden">
            <div className="p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-2">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Documentation</h2>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(markdownContent);
                  }}
                  className="flex items-center gap-2"
                >
                  <Code className="h-4 w-4" /> Copy Content
                </Button>
              </div>
              {/* Full-width documentation content */}
              <div className="bg-muted/10 rounded-lg border border-border/30">
                <div className="p-6 max-h-[600px] overflow-y-auto">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{markdownContent}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

       
        
        {contract && (
          <DeploymentDialog
            isOpen={showDeployDialog}
            onClose={handleCloseDeployDialog}
            contractId={contract.id}
            contractName={contract.name}
          />
        )}
        
        {/* Render the factory dialog when loaded */}
        {FactoryDialog && factoryAddress && (
          <FactoryDialog
            open={showFactoryDialog}
            onOpenChange={setShowFactoryDialog}
            factoryAddress={factoryAddress}
          />
        )}
      </motion.div>
    </div>
  )
} 