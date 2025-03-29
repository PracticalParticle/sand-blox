import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search,
  ArrowRight,
  Shield,
  Clock,
  Wallet,
  ChevronDown,
  Loader2,
  AlertCircle,
  Blocks,
} from 'lucide-react'
import { getAllContracts } from '../lib/catalog'
import type { BloxContract } from '../lib/catalog/types'
import { Button } from '@/components/ui/button'

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

export function BloxContracts() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSecurityLevel, setSelectedSecurityLevel] = useState<string | null>(null)
  const [contracts, setContracts] = useState<BloxContract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    getAllContracts()
      .then(setContracts)
      .catch((err) => {
        console.error('Failed to load contracts:', err)
        setError('Failed to load contracts. Please try again later.')
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      contract.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || contract.category === selectedCategory
    const matchesSecurityLevel =
      !selectedSecurityLevel || contract.securityLevel === selectedSecurityLevel
    return matchesSearch && matchesCategory && matchesSecurityLevel
  })

  const categories = Array.from(new Set(contracts.map((c) => c.category)))
  const securityLevels = Array.from(
    new Set(contracts.map((c) => c.securityLevel))
  )

  if (loading) {
    return (
      <div className="container py-16">
        <div className="flex flex-col items-center justify-center h-[50vh] space-y-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
            <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
          </div>
          <p className="text-lg text-muted-foreground">Loading contracts...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container py-16">
        <div className="flex flex-col items-center justify-center h-[50vh] space-y-6">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold mb-2">Error Loading Contracts</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            size="lg"
            className="hero-gradient-button"
          >
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Hero section with gradient background */}
      <div className="relative">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
        </div>
        
        <div className="container py-12 relative z-10">
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col space-y-10"
          >
            {/* Header */}
            <motion.div variants={item} className="space-y-4 text-center max-w-3xl mx-auto">
              <div className="inline-flex mx-auto items-center justify-center rounded-full bg-primary/10 p-2 mb-4">
                <Blocks className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight">Blox Contracts</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Browse our collection of pre-audited smart contracts. Each contract is
                thoroughly tested and secured with built-in safety features.
              </p>
            </motion.div>

            {/* Search and Filters */}
            <motion.div 
              variants={item} 
              className="bg-card/30 backdrop-blur-sm rounded-xl p-6 border gradient-border max-w-4xl mx-auto"
            >
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search contracts..."
                    className="w-full h-11 rounded-lg border bg-background pl-10 pr-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-4 sm:flex-row lg:w-auto">
                  <div className="relative">
                    <select
                      className="h-11 w-[200px] appearance-none rounded-lg border bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={selectedCategory || ''}
                      onChange={(e) => setSelectedCategory(e.target.value || null)}
                    >
                      <option value="">All Categories</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <div className="relative">
                    <select
                      className="h-11 w-[200px] appearance-none rounded-lg border bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={selectedSecurityLevel || ''}
                      onChange={(e) => setSelectedSecurityLevel(e.target.value || null)}
                    >
                      <option value="">All Security Levels</option>
                      {securityLevels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Stats Summary */}
            {filteredContracts.length > 0 && (
              <motion.div variants={item} className="flex justify-center gap-8 flex-wrap">
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{filteredContracts.length}</p>
                  <p className="text-sm text-muted-foreground">Contracts</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{categories.length}</p>
                  <p className="text-sm text-muted-foreground">Categories</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{securityLevels.length}</p>
                  <p className="text-sm text-muted-foreground">Security Levels</p>
                </div>
              </motion.div>
            )}

            {/* Contract Grid */}
            <motion.div variants={item} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredContracts.map((contract) => (
                <motion.div
                  key={contract.id}
                  whileHover={{ y: -6, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  className="group relative overflow-hidden rounded-xl border gradient-border bg-card hover:bg-card/80"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
                  <div className="relative p-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold">{contract.name}</h3>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors">
                            {contract.category}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              contract.securityLevel === 'Basic'
                                ? 'bg-blue-500/15 text-blue-500'
                                : contract.securityLevel === 'Advanced'
                                ? 'bg-purple-500/15 text-purple-500'
                                : 'bg-orange-500/15 text-orange-500'
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {contract.securityLevel}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {contract.description}
                      </p>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Wallet className="h-4 w-4" />
                          {contract.deployments.toLocaleString()} deployments
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Updated {new Date(contract.lastUpdated).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate(`/contracts/${contract.id}`)}
                      className="mt-6 hero-gradient-button inline-flex w-full items-center justify-center gap-2"
                    >
                      View Details
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {filteredContracts.length === 0 && (
              <motion.div
                variants={item}
                className="flex flex-col items-center gap-6 rounded-xl border bg-card/30 backdrop-blur-sm gradient-border p-10 text-center max-w-lg mx-auto"
              >
                <div className="rounded-full bg-primary/10 p-4">
                  <Search className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">No Contracts Found</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    Try adjusting your search or filters to find what you're looking for.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory(null);
                    setSelectedSecurityLevel(null);
                  }}
                  className="mt-2"
                >
                  Clear Filters
                </Button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
} 