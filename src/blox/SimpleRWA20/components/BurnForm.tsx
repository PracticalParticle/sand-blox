import React, { useState } from 'react';
import { parseUnits, formatUnits } from 'viem';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BurnFormProps {
  onSubmit: (amount: bigint) => Promise<void>;
  isLoading: boolean;
  decimals: number;
  maxAmount: bigint;
  canBurn: boolean;
}

export function BurnForm({ 
  onSubmit, 
  isLoading, 
  decimals,
  maxAmount,
  canBurn
}: BurnFormProps) {
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Format the max amount based on decimals
  const formattedMaxAmount = formatUnits(maxAmount, decimals);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    
    try {
      // Parse the amount with the correct number of decimals
      const parsedAmount = parseUnits(amount, decimals);

      if (parsedAmount > maxAmount) {
        throw new Error("Amount exceeds your balance");
      }

      await onSubmit(parsedAmount);
      setAmount("");
    } catch (error: any) {
      console.error('Form submission error:', error);
      setError(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <div className="flex justify-between text-sm text-muted-foreground">
          <div>Available balance: {Number(formattedMaxAmount).toFixed(4)}</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-primary"
            onClick={() => setAmount(formattedMaxAmount)}
          >
            Max
          </Button>
        </div>
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
                disabled={isLoading || !canBurn} 
                className="w-full"
              >
                {isLoading ? "Processing..." : "Burn Tokens"}
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {!canBurn 
              ? "You need to have tokens to burn"
              : "Burn tokens from your balance"
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </form>
  );
} 