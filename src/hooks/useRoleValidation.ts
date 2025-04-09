import { useState, useEffect } from 'react';
import { Address, Chain } from 'viem';
import { usePublicClient, useWalletClient } from 'wagmi';
import { SecureOwnable } from '../particle-core/sdk/typescript/SecureOwnable';

interface RoleValidationResult {
  isOwner: boolean;
  isBroadcaster: boolean;
  isRecovery: boolean;
  ownerAddress?: Address;
  broadcasterAddress?: Address;
  recoveryAddress?: Address;
  isLoading: boolean;
  error?: Error;
}

const defaultResult: RoleValidationResult = {
  isOwner: false,
  isBroadcaster: false,
  isRecovery: false,
  isLoading: true
};

export function useRoleValidation(
  contractAddress: Address,
  connectedAddress?: Address,
  chain?: Chain
): RoleValidationResult {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [result, setResult] = useState<RoleValidationResult>(defaultResult);

  useEffect(() => {
    let mounted = true;

    async function validateRoles() {
      if (!publicClient || !contractAddress || !chain) {
        if (mounted) {
          setResult({
            ...defaultResult,
            isLoading: false
          });
        }
        return;
      }

      try {
        // Create SecureOwnable instance
        const contract = new SecureOwnable({
          publicClient,
          walletClient,
          contractAddress,
          chain,
          useWalletAsProvider: true
        });

        // Get role addresses
        const [ownerAddress, broadcasterAddress, recoveryAddress] = await Promise.all([
          contract.owner(),
          contract.getBroadcaster(),
          contract.getRecoveryAddress()
        ]);

        if (!mounted) return;

        // Validate roles if connected address exists
        const isOwner = connectedAddress ? 
          connectedAddress.toLowerCase() === ownerAddress.toLowerCase() : false;
        const isBroadcaster = connectedAddress ? 
          connectedAddress.toLowerCase() === broadcasterAddress.toLowerCase() : false;
        const isRecovery = connectedAddress ? 
          connectedAddress.toLowerCase() === recoveryAddress.toLowerCase() : false;

        setResult({
          isOwner,
          isBroadcaster,
          isRecovery,
          ownerAddress,
          broadcasterAddress,
          recoveryAddress,
          isLoading: false
        });
      } catch (error) {
        console.error('Error validating roles:', error);
        if (mounted) {
          setResult({
            ...defaultResult,
            isLoading: false,
            error: error as Error
          });
        }
      }
    }

    validateRoles();

    return () => {
      mounted = false;
    };
  }, [publicClient, walletClient, contractAddress, connectedAddress, chain]);

  return result;
} 