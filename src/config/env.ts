import { z } from 'zod'

// Environment variable schema with validation
const envSchema = z.object({
  // App
  VITE_APP_NAME: z.string().default('SandBlox'),
  VITE_APP_DESCRIPTION: z.string(),
  VITE_APP_URL: z.string().url(),

  // WalletConnect
  VITE_WALLET_CONNECT_PROJECT_ID: z.string(),

  // Network Configuration
  VITE_DEVNET_CHAIN_ID: z.number(),
  VITE_DEVNET_NAME: z.string(),
  VITE_DEVNET_EXPLORER_URL: z.string().optional(),
})

// Type inference
type EnvConfig = z.infer<typeof envSchema>

// Parse and validate environment variables
function parseEnvVariables(): EnvConfig {
  console.log('Loading environment variables:', {
    mode: import.meta.env.MODE,
    base: import.meta.env.BASE_URL,
    dev: import.meta.env.DEV,
    prod: import.meta.env.PROD,
  })

  console.log('Application config:', {
    VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
    VITE_APP_DESCRIPTION: import.meta.env.VITE_APP_DESCRIPTION,
    VITE_APP_URL: import.meta.env.VITE_APP_URL,
  })

  console.log('Network config:', {
    VITE_DEVNET_CHAIN_ID: import.meta.env.VITE_DEVNET_CHAIN_ID,
    VITE_DEVNET_NAME: import.meta.env.VITE_DEVNET_NAME,
  })

  const env = {
    VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
    VITE_APP_DESCRIPTION: import.meta.env.VITE_APP_DESCRIPTION,
    VITE_APP_URL: import.meta.env.VITE_APP_URL,
    VITE_WALLET_CONNECT_PROJECT_ID: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID,
    
    // Network Configuration
    VITE_DEVNET_CHAIN_ID: Number(import.meta.env.VITE_DEVNET_CHAIN_ID),
    VITE_DEVNET_NAME: import.meta.env.VITE_DEVNET_NAME,
    VITE_DEVNET_EXPLORER_URL: import.meta.env.VITE_DEVNET_EXPLORER_URL,
  }

  try {
    return envSchema.parse(env)
  } catch (error) {
    console.error('Environment validation failed:', error)
    throw error
  }
}

// Export validated environment configuration
export const env = parseEnvVariables()

// Network configurations
export const networks = {
  devnet: {
    id: env.VITE_DEVNET_CHAIN_ID,
    name: env.VITE_DEVNET_NAME,
    explorerUrl: env.VITE_DEVNET_EXPLORER_URL,
  }
} as const

// Helper to get active networks
export function getActiveNetworks() {
  return Object.entries(networks)
    .filter(([_, config]) => config !== null)
    .reduce((acc, [key, config]) => {
      acc[key] = config!
      return acc
    }, {} as Record<string, NonNullable<typeof networks[keyof typeof networks]>>)
} 