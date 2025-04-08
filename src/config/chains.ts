import type { Chain } from 'viem';
import { env } from './env';

export const devnet = {
  id: env.VITE_DEVNET_CHAIN_ID,
  name: env.VITE_DEVNET_NAME,
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: [] },
    public: { http: [] }
  },
  blockExplorers: env.VITE_DEVNET_EXPLORER_URL ? {
    default: { name: env.VITE_DEVNET_NAME, url: env.VITE_DEVNET_EXPLORER_URL },
  } : undefined,
  testnet: true,
} as const satisfies Chain; 