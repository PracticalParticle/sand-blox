import { useWalletClient, useChainId, useConfig, useAccount, usePublicClient } from 'wagmi'
import { Address, Hash, PublicClient } from 'viem'
import { SecureContractInfo } from '../lib/types'
import { CONTRACT_ERRORS } from '@/constants/contract'
import { generateNewSecureOwnableManager } from '@/lib/utils'

export function useSecureContract() {
  const chainId = useChainId()
  const { data: walletClient, isLoading: isWalletLoading, error: walletError } = useWalletClient({
    chainId // Specify the chain ID when requesting the wallet client
  })
  const { isConnected, address: accountAddress } = useAccount()
  const config = useConfig()
  const publicClient = usePublicClient()

  const validateAndLoadContract = async (address: Address): Promise<SecureContractInfo> => {
    // Get chain information first
    const chain = config.chains.find(c => c.id === chainId);
    
    console.log('Chain ID:', chainId);
    console.log('Current chain:', chain);
    console.log('Available chains:', config.chains);
    console.log('Wallet connection status:', isConnected);
    console.log('Wallet client:', walletClient);
    console.log('Account address:', accountAddress);
    console.log('Wallet loading:', isWalletLoading);
    console.log('Wallet error:', walletError);

    // First check if we're on a supported chain
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}. Please switch to a supported network.`)
    }

    // Then check if wallet client is still loading
    if (isWalletLoading) {
      throw new Error('Wallet client is initializing')
    }

    // Check for wallet errors
    if (walletError) {
      throw new Error(`Wallet error: ${walletError.message}`)
    }

    // Then check connection status and wallet client availability together
    if (!isConnected || !accountAddress) {
      throw new Error('Please connect your wallet')
    }

    // Check if we have a valid wallet client
    if (!walletClient) {
      throw new Error(`Wallet client not available. Please ensure you are connected to ${chain.name}.`)
    }

    if (!publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    // Validate address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error(CONTRACT_ERRORS.INVALID_ADDRESS)
    }

    try {
      const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
      return await manager.loadContractInfo();
    } catch (error) {
      console.error('Contract validation error:', error)
      throw error
    }
  }

  // Ownership Management
  const transferOwnership = async (address: Address): Promise<Hash> => {
    if (!walletClient || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
    return manager.transferOwnership({ from: accountAddress });
  }

  // Broadcaster Management
  const updateBroadcaster = async (address: Address, newBroadcaster: Address): Promise<Hash> => {
    if (!walletClient || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
    return manager.updateBroadcaster(newBroadcaster, { from: accountAddress });
  }

  const signBroadcasterUpdateApproval = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain, storeTransaction);
    
    return manager.prepareAndSignBroadcasterApproval(BigInt(txId), { from: accountAddress });
  }

  const signTransferOwnershipApproval = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain, storeTransaction);
    
    return manager.prepareAndSignOwnershipApproval(BigInt(txId), { from: accountAddress });
  }

  const signBroadcasterUpdateCancellation = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain, storeTransaction);
    
    return manager.prepareAndSignBroadcasterCancellation(BigInt(txId), { from: accountAddress });
  }

  const signTransferOwnershipCancellation = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain, storeTransaction);
    
    return manager.prepareAndSignOwnershipCancellation(BigInt(txId), { from: accountAddress });
  }

  // Operation Management
  const approveOperation = async (
    address: Address, 
    txId: number, 
    operationType: 'ownership' | 'broadcaster'
  ): Promise<Hash> => {
    if (!walletClient || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
    if (operationType === 'ownership') {
      return manager.approveOwnershipTransfer(BigInt(txId), { from: accountAddress });
    } else {
      return manager.approveBroadcasterUpdate(BigInt(txId), { from: accountAddress });
    }
  }

  const cancelOperation = async (
    address: Address, 
    txId: number, 
    operationType: 'ownership' | 'broadcaster'
  ): Promise<Hash> => {
    if (!walletClient || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
    if (operationType === 'ownership') {
      return manager.cancelOwnershipTransfer(BigInt(txId), { from: accountAddress });
    } else {
      return manager.cancelBroadcasterUpdate(BigInt(txId), { from: accountAddress });
    }
  }

  return {
    validateAndLoadContract,
    transferOwnership,
    updateBroadcaster,
    signBroadcasterUpdateApproval,
    signTransferOwnershipApproval,
    signBroadcasterUpdateCancellation,
    signTransferOwnershipCancellation,
    approveOperation,
    cancelOperation
  }
} 