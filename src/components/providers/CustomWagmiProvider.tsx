import { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, getDefaultConfig, lightTheme, darkTheme } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia } from 'wagmi/chains';
import { devnet } from '@/config/chains';

// Create a new QueryClient instance
const queryClient = new QueryClient();

const availableChains = [devnet, mainnet, sepolia] as const;

// Ensure projectId is properly initialized
const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || '';

const wagmiConfig = getDefaultConfig({
  appName: import.meta.env.VITE_APP_NAME || 'SandBlox UI',
  projectId,
  chains: availableChains,
  ssr: false, // Disable SSR
});

interface CustomWagmiProviderProps {
  children: ReactNode;
}

export function CustomWagmiProvider({ children }: CustomWagmiProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
         // showRecentTransactions={true}
          appInfo={{
            appName: import.meta.env.VITE_APP_NAME || 'SandBlox',
            learnMoreUrl: 'https://sandblox.app/',
          }}
          theme={{
            lightMode: lightTheme(),
            darkMode: darkTheme(),
          }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
