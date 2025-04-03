import { useAccount } from 'wagmi'
import { Address } from 'viem'
import { BaseDeploymentForm, type FormField } from '@/components/BaseDeploymentForm'

interface DeploymentFormProps {
  onDeploy: (params: {
    name: string,
    symbol: string,
    initialOwner: Address,
    broadcaster: Address,
    recovery: Address,
    timeLockPeriodInDays: number
  }) => Promise<void>
  isLoading?: boolean
}

export function DeploymentForm({ onDeploy, isLoading }: DeploymentFormProps) {
  const { address } = useAccount()

  const fields: FormField[] = [
    {
      id: 'name',
      label: 'Token Name',
      placeholder: 'My RWA Token',
      description: 'The full name of your token (e.g., "My Real World Asset")',
      validate: (value) => {
        if (!value) return 'Token name is required'
        if (value.length < 3) return 'Token name must be at least 3 characters'
        if (value.length > 50) return 'Token name must be less than 50 characters'
      }
    },
    {
      id: 'symbol',
      label: 'Token Symbol',
      placeholder: 'RWA',
      description: 'The trading symbol for your token (e.g., "RWA")',
      validate: (value) => {
        if (!value) return 'Token symbol is required'
        if (value.length < 2) return 'Symbol must be at least 2 characters'
        if (value.length > 10) return 'Symbol must be less than 10 characters'
        if (!/^[A-Z0-9]+$/.test(value)) return 'Symbol must contain only uppercase letters and numbers'
      }
    },
    {
      id: 'initialOwner',
      label: 'Initial Owner Address',
      placeholder: '0x...',
      description: 'The primary address that will control the token',
      defaultValue: address,
      validate: (value) => {
        if (!value.startsWith('0x')) return 'Must be a valid Ethereum address'
      }
    },
    {
      id: 'broadcaster',
      label: 'Broadcaster Address',
      placeholder: '0x...',
      description: 'Address authorized to broadcast meta-transactions',
      validate: (value) => {
        if (!value.startsWith('0x')) return 'Must be a valid Ethereum address'
      }
    },
    {
      id: 'recovery',
      label: 'Recovery Address',
      placeholder: '0x...',
      description: 'Backup address for emergency access',
      validate: (value) => {
        if (!value.startsWith('0x')) return 'Must be a valid Ethereum address'
      }
    },
    {
      id: 'timeLockPeriodInDays',
      label: 'Time Lock Period (Days)',
      type: 'number',
      min: 1,
      max: 89,
      description: 'Operation delay in days (1-89)',
      defaultValue: '7',
      validate: (value) => {
        const days = parseInt(value)
        if (isNaN(days) || days < 1 || days > 89) {
          return 'Time lock period must be between 1 and 89 days'
        }
      }
    }
  ]

  return (
    <BaseDeploymentForm
      title="Deploy SimpleRWA20 Token"
      description="Configure your token's parameters and security settings. Choose addresses carefully as they control critical token operations."
      fields={fields}
      onDeploy={onDeploy}
      isLoading={isLoading}
    />
  )
} 