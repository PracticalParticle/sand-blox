import { useState, useEffect } from 'react'
import { usePublicClient, useWalletClient, useConfig, useAccount } from 'wagmi'
import { Address, Hex } from 'viem'
import { SecureOwnable } from '../particle-core/sdk/typescript/SecureOwnable'

// Storage key for operation types cache
const OPERATION_TYPES_CACHE_KEY = 'operationTypes.cache';

interface CachedOperationTypes {
  [contractAddress: string]: {
    types: Array<{ operationType: string; name: string }>;
    timestamp: number;
  };
}

// Cache expiration time - 24 hours
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

export function useOperationTypes(contractAddress?: Address) {
  const [operationTypes, setOperationTypes] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { isConnected } = useAccount()
  const config = useConfig()

  useEffect(() => {
    const loadOperationTypes = async () => {
      if (!contractAddress || !walletClient || !isConnected || !publicClient) {
        setLoading(false)
        return
      }

      try {
        // Check cache first
        const cachedData = localStorage.getItem(OPERATION_TYPES_CACHE_KEY)
        const cache: CachedOperationTypes = cachedData ? JSON.parse(cachedData) : {}
        const cachedEntry = cache[contractAddress]
        
        // If we have valid cached data, use it
        if (cachedEntry && (Date.now() - cachedEntry.timestamp) < CACHE_EXPIRATION) {
          console.log('Using cached operation types for contract:', contractAddress)
          const typeMap = new Map<string, string>()
          cachedEntry.types.forEach(({ operationType, name }) => {
            typeMap.set(operationType, name)
          })
          setOperationTypes(typeMap)
          setLoading(false)
          return
        }

        // If no cache or expired, load from contract
        setLoading(true)
        const chain = config.chains.find(c => c.id === walletClient.chain.id)
        if (!chain) throw new Error('Chain not found')

        const contract = new SecureOwnable({
          publicClient,
          walletClient,
          contractAddress,
          chain,
          useWalletAsProvider: true
        })
        const types = await contract.getSupportedOperationTypes()
        
        // Create a map of operation type hex to name
        const typeMap = new Map<string, string>()
        types.forEach(({ operationType, name }) => {
          typeMap.set(operationType, name)
        })
        
        // Update cache
        cache[contractAddress] = {
          types: types.map(t => ({ operationType: t.operationType, name: t.name })),
          timestamp: Date.now()
        }
        localStorage.setItem(OPERATION_TYPES_CACHE_KEY, JSON.stringify(cache))
        
        setOperationTypes(typeMap)
      } catch (error) {
        console.error('Failed to load operation types:', error)
      } finally {
        setLoading(false)
      }
    }

    loadOperationTypes()
  }, [contractAddress, walletClient, isConnected, publicClient, config.chains])

  return {
    operationTypes,
    loading,
    getOperationName: (type: Hex) => operationTypes.get(type) || 'Unknown Operation'
  }
} 