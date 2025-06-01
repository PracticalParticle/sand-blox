import { Address, Hex } from 'viem';
import { TxStatus } from '../../../particle-core/sdk/typescript/types/lib.index';
import { TxRecord, TxParams } from '../../../particle-core/sdk/typescript/interfaces/lib.index';

export interface NotificationMessage {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
}

/**
 * Parameters for meta-transaction generation
 */
export interface VaultMetaTxParams {
  deadline: bigint;
  maxGasPrice: bigint;
}

/**
 * Represents a transaction record with vault-specific details
 */
export interface VaultTxRecord extends Omit<TxRecord, 'status' | 'params'> {
  status: TxStatus;
  amount: bigint;
  to: Address;
  token?: Address;
  type: "ETH" | "TOKEN";
  params: TxParams & {
    operationType: Hex;
  };
}

/**
 * Token metadata interface
 */
export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}