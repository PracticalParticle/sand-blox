import { Address, Hex } from 'viem';
import { TxStatus } from '../../../particle-core/sdk/typescript/types/lib.index';
import { TxParams, TxRecord } from '../../../particle-core/sdk/typescript/interfaces/lib.index';

export interface NotificationMessage {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
}

/**
 * Parameters for meta-transaction generation
 */
export interface TokenMetaTxParams {
  deadline: bigint;
  maxGasPrice: bigint;
}

/**
 * Represents a transaction record with RWA20-specific details
 */
export interface RWA20TxRecord extends Omit<TxRecord, 'status' | 'params'> {
  status: TxStatus;
  amount: bigint;
  to: Address;
  from?: Address;
  type: "MINT" | "BURN";
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
  totalSupply: bigint;
}
