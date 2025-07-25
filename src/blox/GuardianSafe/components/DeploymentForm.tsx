import { useAccount } from 'wagmi'
import { Address } from 'viem'
import { BaseDeploymentForm, type FormField } from '@/components/BaseDeploymentForm'
import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Label } from "@/components/ui/label"

interface DeploymentFormProps {
  onDeploy: (params: {
    initialOwner: Address,
    broadcaster: Address,
    recovery: Address,
    safeAddress: Address,
    delegatedCallEnabled: boolean,
    timeLockPeriodInDays: number
  }) => Promise<void>
  isLoading?: boolean
}

export function DeploymentForm({ onDeploy, isLoading }: DeploymentFormProps) {
  const { address } = useAccount()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [delegatedCallEnabled, setDelegatedCallEnabled] = useState(false)

  const fields: FormField[] = [
    {
      id: 'safeAddress',
      label: 'Safe Address',
      placeholder: '0x...',
      description: 'The address of the underlying Safe contract to manage',
      validate: (value) => {
        if (!value || !value.startsWith('0x')) return 'Must be a valid Ethereum address'
        return undefined;
      }
    },
    {
      id: 'initialOwner',
      label: 'Initial Owner Address',
      placeholder: '0x...',
      description: 'The primary address that will control the GuardianSafe',
      defaultValue: address,
      validate: (value) => {
        if (!value || !value.startsWith('0x')) return 'Must be a valid Ethereum address'
        return undefined;
      }
    },
    {
      id: 'broadcaster',
      label: 'Broadcaster Address',
      placeholder: '0x...',
      description: 'Address authorized to broadcast meta-transactions',
      validate: (value) => {
        if (!value || !value.startsWith('0x')) return 'Must be a valid Ethereum address'
        return undefined;
      }
    },
    {
      id: 'recovery',
      label: 'Recovery Address',
      placeholder: '0x...',
      description: 'Backup address for emergency access',
      validate: (value) => {
        if (!value || !value.startsWith('0x')) return 'Must be a valid Ethereum address'
        return undefined;
      }
    },
    {
      id: 'timeLockPeriodInDays',
      label: 'Time Lock Period (Days)',
      type: 'number',
      min: 1,
      max: 89,
      description: 'Transaction approval delay in days (1-89)',
      defaultValue: '7',
      validate: (value) => {
        const days = parseInt(value)
        if (isNaN(days) || days < 1 || days > 89) {
          return 'Time lock period must be between 1 and 89 days'
        }
        return undefined;
      }
    }
  ]

  // Custom onDeploy handler to pass delegatedCallEnabled separately
  const handleDeploy = async (params: Record<string, any>) => {
    // Prepare the parameters with delegatedCallEnabled from our state
    const processedParams = {
      ...params,
      initialOwner: params.initialOwner as Address,
      broadcaster: params.broadcaster as Address,
      recovery: params.recovery as Address,
      safeAddress: params.safeAddress as Address,
      timeLockPeriodInDays: parseInt(params.timeLockPeriodInDays),
      delegatedCallEnabled: delegatedCallEnabled
    };
    
    // Call the provided onDeploy function with processed parameters
    await onDeploy(processedParams);
  };

  const customContent = (
    <div className="pt-2">
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="w-full">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="flex items-center p-0 h-auto">
            <span className="text-sm font-medium">Advanced Options</span>
            {advancedOpen ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="flex items-center space-x-2 py-1">
            <input
              type="checkbox"
              id="delegatedCallEnabled"
              checked={delegatedCallEnabled}
              onChange={(e) => setDelegatedCallEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="delegatedCallEnabled" className="text-sm font-normal cursor-pointer">
              Enable Delegated Calls
            </Label>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Allow execution of delegated calls (advanced feature)
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  return (
    <BaseDeploymentForm
      title="Deploy GuardianSafe"
      description="Configure your GuardianSafe's security parameters. This contract adds a time-lock and meta-transaction layer to an existing Safe contract."
      fields={fields}
      onDeploy={handleDeploy}
      isLoading={isLoading}
      customContent={customContent}
    />
  )
}
