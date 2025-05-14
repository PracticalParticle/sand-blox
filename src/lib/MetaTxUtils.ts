import { Address, Chain, Hex, WalletClient, hashTypedData } from 'viem';
import { MetaTransaction } from '../particle-core/sdk/typescript/interfaces/lib.index';
import { TransactionOptions } from '../particle-core/sdk/typescript/interfaces/base.index';

/**
 * Typed data for EIP-712 signature of meta transactions
 */
interface MetaTxTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    MetaTransaction: Array<{ name: string; type: string }>;
    TxRecord: Array<{ name: string; type: string }>;
    TxParams: Array<{ name: string; type: string }>;
    MetaTxParams: Array<{ name: string; type: string }>;
    PaymentDetails: Array<{ name: string; type: string }>;
  };
  primaryType: string;
  message: any;
}

/**
 * Creates the typed data structure for an EIP-712 signature based on the meta-transaction parameters
 * 
 * @param metaTx The unsigned meta transaction
 * @param verifyingContract The contract address that will verify the signature
 * @returns Structured typed data following the EIP-712 standard
 */
export function createMetaTxTypedData(metaTx: MetaTransaction, verifyingContract: Address): MetaTxTypedData {
  // Define the domain separator values matching the contract implementation
  const domain = {
    name: 'MultiPhaseSecureOperation',
    version: '1',
    chainId: Number(metaTx.params.chainId),
    verifyingContract
  };

  // Define the types matching the contract's EIP-712 structure
  const types = {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    MetaTransaction: [
      { name: 'txRecord', type: 'TxRecord' },
      { name: 'params', type: 'MetaTxParams' },
      { name: 'data', type: 'bytes' }
    ],
    TxRecord: [
      { name: 'txId', type: 'uint256' },
      { name: 'releaseTime', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'params', type: 'TxParams' },
      { name: 'message', type: 'bytes32' },
      { name: 'result', type: 'bytes' },
      { name: 'payment', type: 'PaymentDetails' }
    ],
    TxParams: [
      { name: 'requester', type: 'address' },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'gasLimit', type: 'uint256' },
      { name: 'operationType', type: 'bytes32' },
      { name: 'executionType', type: 'uint8' },
      { name: 'executionOptions', type: 'bytes' }
    ],
    MetaTxParams: [
      { name: 'chainId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'handlerContract', type: 'address' },
      { name: 'handlerSelector', type: 'bytes4' },
      { name: 'deadline', type: 'uint256' },
      { name: 'maxGasPrice', type: 'uint256' },
      { name: 'signer', type: 'address' }
    ],
    PaymentDetails: [
      { name: 'recipient', type: 'address' },
      { name: 'nativeTokenAmount', type: 'uint256' },
      { name: 'erc20TokenAddress', type: 'address' },
      { name: 'erc20TokenAmount', type: 'uint256' }
    ]
  };

  // Create the message object that matches the contract's encoding
  const message = {
    txRecord: {
      txId: metaTx.txRecord.txId,
      releaseTime: metaTx.txRecord.releaseTime,
      status: metaTx.txRecord.status,
      params: {
        requester: metaTx.txRecord.params.requester,
        target: metaTx.txRecord.params.target,
        value: metaTx.txRecord.params.value,
        gasLimit: metaTx.txRecord.params.gasLimit,
        operationType: metaTx.txRecord.params.operationType,
        executionType: metaTx.txRecord.params.executionType,
        executionOptions: metaTx.txRecord.params.executionOptions
      },
      message: metaTx.txRecord.message || '0x0000000000000000000000000000000000000000000000000000000000000000',
      result: metaTx.txRecord.result || '0x',
      payment: {
        recipient: metaTx.txRecord.payment?.recipient || '0x0000000000000000000000000000000000000000',
        nativeTokenAmount: metaTx.txRecord.payment?.nativeTokenAmount || 0n,
        erc20TokenAddress: metaTx.txRecord.payment?.erc20TokenAddress || '0x0000000000000000000000000000000000000000',
        erc20TokenAmount: metaTx.txRecord.payment?.erc20TokenAmount || 0n
      }
    },
    params: {
      chainId: metaTx.params.chainId,
      nonce: metaTx.params.nonce,
      handlerContract: metaTx.params.handlerContract,
      handlerSelector: metaTx.params.handlerSelector,
      deadline: metaTx.params.deadline,
      maxGasPrice: metaTx.params.maxGasPrice,
      signer: metaTx.params.signer
    },
    data: metaTx.data || '0x'
  };

  return {
    domain,
    types,
    primaryType: 'MetaTransaction',
    message
  };
}

/**
 * Sign a meta transaction using EIP-712 signTypedData with fallback to raw message signing
 * 
 * @param walletClient The wallet client to use for signing
 * @param unsignedMetaTx The unsigned meta transaction
 * @param contractAddress The address of the contract that will verify the signature
 * @param options Transaction options including the sender address
 * @returns The signed meta transaction
 */
export async function signMetaTransaction(
  walletClient: WalletClient,
  unsignedMetaTx: MetaTransaction,
  contractAddress: Address,
  options: TransactionOptions
): Promise<MetaTransaction> {
  if (!options.from) {
    throw new Error('Sender address is required for signing meta transactions');
  }

  // Get the message hash from the unsigned meta transaction
  const expectedHash = unsignedMetaTx.message;
  
  try {
    // Create the typed data structure for EIP-712 signing
    const typedData = createMetaTxTypedData(unsignedMetaTx, contractAddress);
    
    // Try to verify our hash against the expected hash from the contract
    let useEip712 = true;
    let hashVerified = false;
    
    try {
      // Compute hash from our structured data using viem's hashTypedData
      const computedHash = hashTypedData({
        domain: typedData.domain as any,
        types: typedData.types as any,
        primaryType: typedData.primaryType as any,
        message: typedData.message,
      });
      
      console.log('Hash comparison:');
      console.log('- Expected hash from contract:', expectedHash);
      console.log('- Computed hash from EIP-712:', computedHash);
      
      // Check if our computed hash matches the one from the contract
      if (computedHash !== expectedHash) {
        console.warn('⚠️ EIP-712 computed hash does not match the expected hash from contract');
        console.warn('This may indicate a structure mismatch, but will try EIP-712 signing anyway');
        useEip712 = true; // Still try EIP-712 first, but be prepared to fall back
      } else {
        console.log('✅ EIP-712 hash matches expected contract hash');
        hashVerified = true;
      }
    } catch (hashError) {
      console.warn('Failed to compute EIP-712 hash for verification:', hashError);
      // We'll still try EIP-712 signing even if hash verification fails
    }
    
    let signature: Hex;
    
    if (useEip712) {
      try {
        // First try EIP-712 signing (better UX)
        signature = await walletClient.signTypedData({
          account: options.from,
          domain: typedData.domain as any,
          types: typedData.types as any,
          primaryType: typedData.primaryType as any,
          message: typedData.message,
        }) as Hex;
        
        console.log('Successfully signed with EIP-712 typed data');
      } catch (eip712Error) {
        console.warn('EIP-712 signing failed, falling back to raw message signing:', eip712Error);
        
        // Fall back to raw message signing
        signature = await walletClient.signMessage({
          message: { raw: expectedHash as Hex },
          account: options.from
        }) as Hex;
        
        console.log('Successfully signed with raw message fallback');
      }
    } else {
      // If hash verification failed completely, use raw message signing directly
      signature = await walletClient.signMessage({
        message: { raw: expectedHash as Hex },
        account: options.from
      }) as Hex;
      
      console.log('Using raw message signing due to hash mismatch');
    }

    // Create the signed meta transaction
    const signedMetaTx: MetaTransaction = {
      ...unsignedMetaTx,
      signature
    };

    return signedMetaTx;
  } catch (error) {
    console.error('Error signing meta transaction:', error);
    throw new Error(`Failed to sign meta transaction: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Utility function for serializing BigInt values in JSON.stringify
 */
export function bigIntReplacer(_key: string, value: any): any {
  if (typeof value === "bigint") {
    return value.toString() + 'n';
  }
  return value;
}

/**
 * Utility function for deserializing BigInt values from JSON.parse
 */
export function bigIntReviver(_key: string, value: any): any {
  if (typeof value === 'string' && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

/**
 * Prepare and sign a meta transaction, then store it if a storage function is provided
 * 
 * @param walletClient The wallet client to use for signing
 * @param unsignedMetaTx The unsigned meta transaction
 * @param contractAddress The address of the contract that will verify the signature
 * @param options Transaction options including the sender address
 * @param metadata Additional metadata to store with the transaction
 * @param storeTransaction Optional function to store the transaction
 * @returns The serialized signed meta transaction
 */
export async function prepareAndSignMetaTransaction(
  walletClient: WalletClient,
  unsignedMetaTx: MetaTransaction,
  contractAddress: Address,
  options: TransactionOptions,
  metadata: Record<string, unknown>,
  storeTransaction?: (txId: string, signedData: string, metadata?: Record<string, unknown>) => void
): Promise<string> {
  // Sign the meta transaction
  const signedMetaTx = await signMetaTransaction(
    walletClient,
    unsignedMetaTx,
    contractAddress,
    options
  );
  
  // Convert to JSON string for storage/transport
  const serializedMetaTx = JSON.stringify(signedMetaTx, bigIntReplacer);
  
  // Store the transaction if a storage function is provided
  if (storeTransaction) {
    const txId = signedMetaTx.txRecord.txId.toString();
    storeTransaction(
      txId,
      serializedMetaTx,
      {
        ...metadata,
        timestamp: Date.now(),
        broadcasted: false,
        status: 'PENDING'
      }
    );
  }
  
  return serializedMetaTx;
} 