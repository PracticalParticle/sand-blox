import { useWalletClient, useChainId, useConfig, useAccount, usePublicClient } from 'wagmi'
import { Address, Hash, PublicClient } from 'viem'
import { SecureContractInfo } from '../lib/types'
import { CONTRACT_ERRORS } from '@/constants/contract'
import { generateNewSecureOwnableManager } from '@/lib/utils'

export function useSecureContract() {
  const chainId = useChainId()
  const { data: walletClient, isLoading: isWalletLoading } = useWalletClient({
    chainId
  })
  const { isConnected } = useAccount()
  const config = useConfig()
  const publicClient = usePublicClient()

  const validateAndLoadContract = async (address: Address): Promise<SecureContractInfo> => {
    console.log('Wallet connection status:', isConnected);
    console.log('Wallet client:', walletClient);

    // First check if wallet client is still loading
    if (isWalletLoading) {
      throw new Error('Wallet client is initializing')
    }

    // Then check connection status and wallet client availability together
    if (!isConnected || !walletClient) {
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

      const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
      return await manager.loadContractInfo();
    } catch (error) {
      console.error('Contract validation error:', error)
      throw error
    }
  }

  // Ownership Management
  const transferOwnership = async (address: Address): Promise<Hash> => {
    if (!walletClient?.account || !publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
    return manager.transferOwnership({ from: walletClient.account.address });
  }

  // Broadcaster Management
  const updateBroadcaster = async (address: Address, newBroadcaster: Address): Promise<Hash> => {
    if (!walletClient?.account || !publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
    return manager.updateBroadcaster(newBroadcaster, { from: walletClient.account.address });
  }

  const signBroadcasterUpdateApproval = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient?.account || !publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain, storeTransaction);
    
    return manager.prepareAndSignBroadcasterApproval(BigInt(txId), { from: walletClient.account.address });
  } 

  const signTransferOwnershipApproval = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient?.account || !publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain, storeTransaction);
    
    return manager.prepareAndSignOwnershipApproval(BigInt(txId), { from: walletClient.account.address });
  }

  const signBroadcasterUpdateCancellation = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient?.account || !publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain, storeTransaction);
    
    return manager.prepareAndSignBroadcasterCancellation(BigInt(txId), { from: walletClient.account.address });
  }

  const signTransferOwnershipCancellation = async (address: Address, txId: number, storeTransaction: (txId: string, signedTx: string, metadata?: Record<string, unknown>) => void): Promise<string> => {
    if (!walletClient?.account || !publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }
    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain, storeTransaction);
    
    return manager.prepareAndSignOwnershipCancellation(BigInt(txId), { from: walletClient.account.address });
  }

  // Operation Management
  const approveOperation = async (
    address: Address, 
    txId: number, 
    operationType: 'ownership' | 'broadcaster'
  ): Promise<Hash> => {
    if (!walletClient?.account || !publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
    if (operationType === 'ownership') {
      return manager.approveOwnershipTransfer(BigInt(txId), { from: walletClient.account.address });
    } else {
      return manager.approveBroadcasterUpdate(BigInt(txId), { from: walletClient.account.address });
    }
  }

  const cancelOperation = async (
    address: Address, 
    txId: number, 
    operationType: 'ownership' | 'broadcaster'
  ): Promise<Hash> => {
    if (!walletClient?.account || !publicClient) {
      throw new Error(CONTRACT_ERRORS.NO_WALLET)
    }

    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) {
      throw new Error(CONTRACT_ERRORS.NO_CLIENT)
    }

    const manager = await generateNewSecureOwnableManager(publicClient, walletClient, address, chain);
    if (operationType === 'ownership') {
      return manager.cancelOwnershipTransfer(BigInt(txId), { from: walletClient.account.address });
    } else {
      return manager.cancelBroadcasterUpdate(BigInt(txId), { from: walletClient.account.address });
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