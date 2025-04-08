import { useWalletClient, useChainId, useConfig, useAccount, usePublicClient } from 'wagmi'
import { Address, Hash, PublicClient } from 'viem'
import { SecureContractInfo } from '../lib/types'
import { CONTRACT_ERRORS } from '@/constants/contract'
import { generateNewSecureOwnableManager } from '@/lib/utils'

export function useSecureContract() {
  const chainId = useChainId()
  const walletClient = useWalletClient()
  const { isConnected, address: accountAddress } = useAccount()
  const config = useConfig()
  const publicClient = usePublicClient()

  const validateAndLoadContract = async (address: Address): Promise<SecureContractInfo> => {
    console.log('Wallet connection status:', isConnected);
    console.log('Wallet client:', walletClient);
    console.log('Account address:', accountAddress);

    // First check if wallet client is still loading
    if (walletClient.isLoading) {
      throw new Error('Wallet client is initializing')
    }

    // Check for wallet errors
    if (walletClient.error) {
      throw new Error(`Wallet error: ${walletClient.error.message}`)
    }

    // Then check connection status and wallet client availability together
    if (!isConnected || !walletClient.data) {
      throw new Error('Please connect your wallet')
    }

    if (!publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    // Validate address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error(CONTRACT_ERRORS.INVALID_ADDRESS)
    }

    try {
      // Get chain information
      const chain = config.chains.find(c => c.id === chainId);
      if (!chain) {
        throw new Error(CONTRACT_ERRORS.CHAIN_MISMATCH)
      }

      const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain);
      return await manager.loadContractInfo();
    } catch (error) {
      console.error('Contract validation error:', error)
      throw error
    }
  }

  // Ownership Management
  const transferOwnership = async (address: Address): Promise<Hash> => {
    if (!walletClient.data || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain);
    return manager.transferOwnership({ from: accountAddress });
  }

  // Broadcaster Management
  const updateBroadcaster = async (address: Address, newBroadcaster: Address): Promise<Hash> => {
    if (!walletClient.data || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain);
    return manager.updateBroadcaster(newBroadcaster, { from: accountAddress });
  }

  const signBroadcasterUpdateApproval = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient.data || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain, storeTransaction);
    
    return manager.prepareAndSignBroadcasterApproval(BigInt(txId), { from: accountAddress });
  }

  const signTransferOwnershipApproval = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient.data || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain, storeTransaction);
    
    return manager.prepareAndSignOwnershipApproval(BigInt(txId), { from: accountAddress });
  }

  const signBroadcasterUpdateCancellation = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient.data || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain, storeTransaction);
    
    return manager.prepareAndSignBroadcasterCancellation(BigInt(txId), { from: accountAddress });
  }

  const signTransferOwnershipCancellation = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient.data || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain, storeTransaction);
    
    return manager.prepareAndSignOwnershipCancellation(BigInt(txId), { from: accountAddress });
  }

  // Operation Management
  const approveOperation = async (
    address: Address, 
    txId: number, 
    operationType: 'ownership' | 'broadcaster'
  ): Promise<Hash> => {
    if (!walletClient.data || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain);
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
    if (!walletClient.data || !publicClient || !accountAddress) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient.data, address, chain);
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