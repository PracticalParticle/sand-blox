import { useState, useCallback } from 'react';
import { Address, Hex } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useChain } from '@/hooks/useChain';
import SimpleRWA20 from '../SimpleRWA20';

type NotificationMessage = {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
};

interface SignedMetaTxState {
  signedData: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export function useMetaTxActions(
  contractAddress: Address,
  onSuccess?: (message: NotificationMessage) => void,
  onError?: (message: NotificationMessage) => void,
  onRefresh?: () => Promise<void>
) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chain = useChain();
  const [isLoading, setIsLoading] = useState(false);
  const [signedMetaTxStates, setSignedMetaTxStates] = useState<Record<string, SignedMetaTxState>>({});

  const handleMetaTxSign = useCallback(async (
    txId: number,
    type: 'mint' | 'burn'
  ) => {
    if (!address || !walletClient || !chain || !contractAddress) {
      onError?.({
        type: 'error',
        title: 'Error',
        description: 'Wallet not connected or contract not initialized'
      });
      return;
    }

    setIsLoading(true);

    try {
      const token = new SimpleRWA20(publicClient, walletClient, contractAddress, chain);
      let signedData: string;

      if (type === 'mint') {
        signedData = await token.signMintMetaTx(txId);
      } else {
        signedData = await token.signBurnMetaTx(txId);
      }

      setSignedMetaTxStates(prev => ({
        ...prev,
        [txId.toString()]: {
          signedData,
          timestamp: Date.now(),
          metadata: {
            type: type.toUpperCase(),
            operationType: type === 'mint' ? '0x01' : '0x02' as Hex
          }
        }
      }));

      onSuccess?.({
        type: 'success',
        title: 'Meta-transaction Signed',
        description: `Successfully signed ${type} meta-transaction`
      });
    } catch (error: any) {
      console.error(`Failed to sign ${type} meta-transaction:`, error);
      onError?.({
        type: 'error',
        title: 'Signing Failed',
        description: error.message || `Failed to sign ${type} meta-transaction`
      });
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, chain, contractAddress, publicClient, onSuccess, onError]);

  const handleBroadcastMetaTx = useCallback(async (
    txId: number,
    signedData: string
  ) => {
    if (!address || !walletClient || !chain || !contractAddress) {
      onError?.({
        type: 'error',
        title: 'Error',
        description: 'Wallet not connected or contract not initialized'
      });
      return;
    }

    setIsLoading(true);

    try {
      const token = new SimpleRWA20(publicClient, walletClient, contractAddress, chain);
      await token.broadcastMetaTx(signedData);

      // Remove the signed state after successful broadcast
      setSignedMetaTxStates(prev => {
        const newState = { ...prev };
        delete newState[txId.toString()];
        return newState;
      });

      onSuccess?.({
        type: 'success',
        title: 'Meta-transaction Broadcasted',
        description: 'Successfully broadcasted meta-transaction'
      });

      // Refresh data after successful broadcast
      await onRefresh?.();
    } catch (error: any) {
      console.error('Failed to broadcast meta-transaction:', error);
      onError?.({
        type: 'error',
        title: 'Broadcast Failed',
        description: error.message || 'Failed to broadcast meta-transaction'
      });
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, chain, contractAddress, publicClient, onSuccess, onError, onRefresh]);

  return {
    handleMetaTxSign,
    handleBroadcastMetaTx,
    signedMetaTxStates,
    isLoading
  };
} 