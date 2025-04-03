import React, { useState } from 'react';
import { Address, parseUnits } from 'viem';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MintFormProps {
  onSubmit: (to: Address, amount: bigint) => Promise<void>;
  isLoading: boolean;
  decimals: number;
  canMint: boolean;
}

// Utility function to validate Ethereum addresses
const isValidAddress = (address: string): address is Address => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export function MintForm({ 
  onSubmit, 
  isLoading, 
  decimals,
  canMint
}: MintFormProps) {
  const [to, setTo] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    
    try {
      // Validate the recipient address
      if (!isValidAddress(to)) {
        throw new Error("Invalid recipient address");
      }

      // Parse the amount with the correct number of decimals
      const parsedAmount = parseUnits(amount, decimals);

      await onSubmit(to as Address, parsedAmount);
      setTo("");
      setAmount("");
    } catch (error: any) {
      console.error('Form submission error:', error);
      setError(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="to">Recipient Address</Label>
        <Input
          id="to"
          name="recipientAddress"
          placeholder="0x..."
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          pattern="^0x[a-fA-F0-9]{40}$"
          aria-label="Recipient address input"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="any"
          min="0"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          aria-label="Token amount input"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button 
                type="submit" 
                disabled={isLoading || !canMint} 
                className="w-full"
              >
                {isLoading ? "Processing..." : "Mint Tokens"}
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {!canMint 
              ? "Only the owner can mint tokens"
              : "Mint new tokens to the specified address"
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </form>
  );
} 