import { Address, PublicClient, WalletClient, Chain, Abi } from 'viem';
import SimpleRWA20ABIJson from './SimpleRWA20.abi.json';
import { MetaTransaction } from '../../particle-core/sdk/typescript/interfaces/lib.index';
import { TransactionOptions, TransactionResult } from '../../particle-core/sdk/typescript/interfaces/base.index';

// Parse and type the ABI
const SimpleRWA20ABI = SimpleRWA20ABIJson as Abi;

/**
 * Parameters for meta-transaction generation
 */
export interface TokenMetaTxParams {
  deadline: bigint;
  maxGasPrice: bigint;
}

/**
 * @title SimpleRWA20
 * @notice TypeScript interface for SimpleRWA20 smart contract
 * @dev Pure SDK interface that maps directly to SimpleRWA20.sol contract methods
 */
export default class SimpleRWA20 {
  protected client: PublicClient;
  protected walletClient?: WalletClient;
  protected contractAddress: Address;
  protected chain: Chain;

  // Constants reflecting the Solidity contract
  static readonly MINT_TOKENS = "MINT_TOKENS";
  static readonly BURN_TOKENS = "BURN_TOKENS";

  /**
   * @notice Creates a new SimpleRWA20 instance
   * @param client The viem PublicClient instance for blockchain interactions
   * @param walletClient Optional WalletClient for signing transactions
   * @param contractAddress The address of the contract
   * @param chain The chain object for the network
   */
  constructor(
    client: PublicClient,
    walletClient: WalletClient | undefined,
    contractAddress: Address,
    chain: Chain
  ) {
    this.client = client;
    this.walletClient = walletClient;
    this.contractAddress = contractAddress;
    this.chain = chain;
  }

  /**
   * @notice Gets the token balance of an address
   * @param address The address to check balance for
   * @return The token balance
   */
  async balanceOf(address: Address): Promise<bigint> {
    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'balanceOf',
      args: [address]
    }) as bigint;
  }

  /**
   * @notice Gets the total supply of tokens
   * @return The total supply
   */
  async totalSupply(): Promise<bigint> {
    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'totalSupply'
    }) as bigint;
  }

  /**
   * @notice Gets the name of the token
   * @return The token name
   */
  async name(): Promise<string> {
    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'name'
    }) as string;
  }

  /**
   * @notice Gets the symbol of the token
   * @return The token symbol
   */
  async symbol(): Promise<string> {
    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'symbol'
    }) as string;
  }

  /**
   * @notice Gets the decimals of the token
   * @return The token decimals
   */
  async decimals(): Promise<number> {
    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'decimals'
    }) as number;
  }

  /**
   * @notice Gets the allowance amount for a spender
   * @param owner The owner address
   * @param spender The spender address
   * @return The allowance amount
   */
  async allowance(owner: Address, spender: Address): Promise<bigint> {
    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'allowance',
      args: [owner, spender]
    }) as bigint;
  }

  /**
   * @notice Approve a spender to use tokens
   * @param spender The spender address
   * @param amount The amount to approve
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async approve(
    spender: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'approve',
      args: [spender, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Transfer tokens to a recipient
   * @param to Recipient address
   * @param amount Amount to transfer
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async transfer(
    to: Address,
    amount: bigint,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'transfer',
      args: [to, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Mint tokens using meta-transaction
   * @param metaTx The meta-transaction data
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async mintWithMetaTx(
    metaTx: MetaTransaction,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'mintWithMetaTx',
      args: [metaTx],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Burn tokens using meta-transaction
   * @param metaTx The meta-transaction data
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async burnWithMetaTx(
    metaTx: MetaTransaction,
    options: TransactionOptions
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'burnWithMetaTx',
      args: [metaTx],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Generate unsigned meta-transaction for minting tokens
   * @param to Recipient address
   * @param amount Amount of tokens to mint
   * @param metaTxParams Parameters for the meta-transaction
   * @return The unsigned meta-transaction
   */
  async generateUnsignedMintMetaTx(
    to: Address,
    amount: bigint,
    metaTxParams: TokenMetaTxParams
  ): Promise<MetaTransaction> {
    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'generateUnsignedMintMetaTx',
      args: [to, amount, {
        deadline: metaTxParams.deadline,
        maxGasPrice: metaTxParams.maxGasPrice
      }]
    }) as MetaTransaction;
  }

  /**
   * @notice Generate unsigned meta-transaction for burning tokens
   * @param from Address to burn tokens from
   * @param amount Amount of tokens to burn
   * @param metaTxParams Parameters for the meta-transaction
   * @return The unsigned meta-transaction
   */
  async generateUnsignedBurnMetaTx(
    from: Address,
    amount: bigint,
    metaTxParams: TokenMetaTxParams
  ): Promise<MetaTransaction> {
    return await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleRWA20ABI,
      functionName: 'generateUnsignedBurnMetaTx',
      args: [from, amount, {
        deadline: metaTxParams.deadline,
        maxGasPrice: metaTxParams.maxGasPrice
      }]
    }) as MetaTransaction;
  }
}
