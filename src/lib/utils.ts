import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Address, Chain as ViemChain , PublicClient, WalletClient } from 'viem'
import { devnet } from '@/config/chains'
import { mainnet, sepolia } from 'wagmi/chains'
import { SecureOwnableManager } from "./SecureOwnableManager"

/// <reference types="node" />

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export function formatBalance(balance: bigint, decimals: number = 18): string {
  if (!balance) return '0'
  return (Number(balance) / 10 ** decimals).toFixed(4)
}

export function formatHash(hash: string): string {
  if (!hash) return ''
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

export function formatNumber(num: number): string {
  return num.toLocaleString('en-US')
}

export function formatCurrency(num: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num)
}

export function formatPercentage(num: number): string {
  return `${num.toFixed(2)}%`
}

export function classNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ")
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }

    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + "..."
}

export function truncateAddress(address: string, startLength: number = 7, endLength: number = 6): string {
  if (address.length <= startLength + endLength) return address; // Return the full address if it's short enough
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

// Updated Chain type to support any chain ID
export type Chain = number

// Common chain IDs
export const COMMON_CHAINS = {
  MAINNET: mainnet.id,
  SEPOLIA: sepolia.id,
  GOERLI: 5,
  POLYGON: 137,
  MUMBAI: 80001,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  BSC: 56,
  AVALANCHE: 43114,
  LOCAL: devnet.id
} as const

// Updated getChainName to work with a chains parameter
export function getChainName(chainId: Chain, chains: ViemChain[]): string {
  const chain = chains.find(c => c.id === chainId)
  if (chain) return chain.name
  if (chainId === devnet.id) return devnet.name
  return "Unknown"
}

export function isTestnet(chainId: Chain, chains: ViemChain[]): boolean {
  const chain = chains.find(c => c.id === chainId)
  if (chain) return chain.testnet ?? false
  if (chainId === devnet.id) return devnet.testnet
  return false
}

/**
 * Formats a bigint value to a human-readable number with the specified number of decimals
 * @param value The bigint value to format
 * @param decimals The number of decimals to use (default: 18 for ETH)
 * @param displayDecimals The number of decimals to display (default: 4)
 * @returns Formatted string with the specified number of decimals
 */
export function formatTokenBalance(value: bigint, decimals: number = 18, displayDecimals: number = 4): string {
  if (value === BigInt(0)) return '0.0000';
  
  const divisor = BigInt(10) ** BigInt(decimals);
  const beforeDecimal = value / divisor;
  const afterDecimal = value % divisor;
  
  // Convert the remainder to a fixed number of decimals
  const remainderStr = afterDecimal.toString().padStart(decimals, '0');
  const significantDecimals = remainderStr.slice(0, displayDecimals);
  
  // Combine the parts and trim trailing zeros
  const result = `${beforeDecimal.toString()}.${significantDecimals}`;
  return result.replace(/\.?0+$/, '');
}

export async function generateNewSecureOwnableManager(
  publicClient: PublicClient,
  walletClient: WalletClient | undefined,
  address: Address,
  chain: ViemChain,
  storeTransaction?: (txId: string, signedData: string, metadata: any) => void
): Promise<SecureOwnableManager> {
  const manager = new SecureOwnableManager(
    publicClient,
    walletClient,
    address,
    chain,
    storeTransaction
  );
  await manager.init();
  return manager;
}
/**
 * Format a Unix timestamp into a human-readable date string
 * @param timestamp Unix timestamp in seconds
 * @returns Formatted date string
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000) // Convert to milliseconds
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Recursively converts all BigInt values in an object to strings
 * This is useful when we need to serialize data that contains BigInt values
 */
export function convertBigIntsToStrings(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigIntsToStrings);
  }

  if (typeof obj === 'object') {
    const result: { [key: string]: any } = {};
    for (const key in obj) {
      result[key] = convertBigIntsToStrings(obj[key]);
    }
    return result;
  }

  return obj;
} 