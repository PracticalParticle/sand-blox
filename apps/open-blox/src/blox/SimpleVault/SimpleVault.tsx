import { 
  Address, 
  PublicClient, 
  WalletClient,
  Chain,
  parseAbi,
  Abi,
  encodeFunctionData
} from 'viem';
import SimpleVaultABIJson from './SimpleVault.abi.json';
import SecureOwnable from '../../../contracts/core/SecureOwnable/SecureOwnable';
import { 
  TransactionOptions,
  TransactionResult,
  TxRecord,
  MetaTransaction
} from '../../../contracts/core/iCore';

// Parse and type the ABI
const SimpleVaultABI = SimpleVaultABIJson as Abi;

/**
 * @title SimpleVault
 * @notice TypeScript interface for SimpleVault smart contract
 * @dev Extends SecureOwnable to provide secure vault functionality for ETH and ERC20 tokens
 */
class SimpleVault extends SecureOwnable {
  // Constants for operation types
  static readonly WITHDRAW_ETH = "WITHDRAW_ETH";
  static readonly WITHDRAW_TOKEN = "WITHDRAW_TOKEN";

  /**
   * @notice Creates a new SimpleVault instance
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
    super(client, walletClient, contractAddress, chain);
  }

  /**
   * @notice Gets the ETH balance of the vault
   * @return The ETH balance in wei
   */
  async getEthBalance(): Promise<bigint> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleVaultABI,
      functionName: 'getEthBalance'
    });
    return result as bigint;
  }

  /**
   * @notice Gets the token balance of the vault
   * @param token The token contract address
   * @return The token balance
   */
  async getTokenBalance(token: Address): Promise<bigint> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      abi: SimpleVaultABI,
      functionName: 'getTokenBalance',
      args: [token]
    });
    return result as bigint;
  }

  /**
   * @notice Request ETH withdrawal from the vault
   * @param to Recipient address
   * @param amount Amount of ETH to withdraw in wei
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async withdrawEthRequest(
    to: Address,
    amount: bigint,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const currentBalance = await this.getEthBalance();
    if (amount > currentBalance) {
      throw new Error("Insufficient vault balance");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleVaultABI,
      functionName: 'withdrawEthRequest',
      args: [to, amount],
      value: amount,
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Request token withdrawal from the vault
   * @param token Token contract address
   * @param to Recipient address
   * @param amount Amount of tokens to withdraw
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async withdrawTokenRequest(
    token: Address,
    to: Address,
    amount: bigint,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const currentBalance = await this.getTokenBalance(token);
    if (amount > currentBalance) {
      throw new Error("Insufficient token balance");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleVaultABI,
      functionName: 'withdrawTokenRequest',
      args: [token, to, amount],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Approve a withdrawal after the time delay has passed
   * @param txId The ID of the withdrawal transaction to approve
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async approveWithdrawalAfterDelay(
    txId: number,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const operation = await this.getOperation(txId);
    if (operation.status !== SecureOwnable.TxStatus.PENDING) {
      throw new Error("Can only approve pending requests");
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp < operation.releaseTime) {
      throw new Error("Current time is before release time");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleVaultABI,
      functionName: 'approveWithdrawalAfterDelay',
      args: [txId],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Cancel a pending withdrawal request
   * @param txId The ID of the withdrawal transaction to cancel
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async cancelWithdrawal(
    txId: number,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const owner = await this.owner();
    await this.validations.validateRole(options.from, owner, "owner");

    const operation = await this.getOperation(txId);
    if (operation.status !== SecureOwnable.TxStatus.PENDING) {
      throw new Error("Can only cancel pending requests");
    }

    const timeLockPeriod = await this.getTimeLockPeriodInDays();
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp < operation.releaseTime - (timeLockPeriod * 24 * 60 * 60) + 3600) {
      throw new Error("Cannot cancel within first hour");
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleVaultABI,
      functionName: 'cancelWithdrawal',
      args: [txId],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }

  /**
   * @notice Approve withdrawal with meta transaction
   * @param metaTx The meta-transaction data
   * @param options Transaction options
   * @return TransactionResult containing hash and wait function
   */
  async approveWithdrawalWithMetaTx(
    metaTx: MetaTransaction,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!this.walletClient) throw new Error("WalletClient required for write operations");
    if (!options.from) throw new Error("Sender address required");

    const broadcaster = await this.getBroadcaster();
    await this.validations.validateBroadcaster(options.from, broadcaster);
    await this.validations.validateMetaTransaction(metaTx);

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.contractAddress,
      abi: SimpleVaultABI,
      functionName: 'approveWithdrawalWithMetaTx',
      args: [metaTx],
      account: options.from
    });

    return {
      hash,
      wait: () => this.client.waitForTransactionReceipt({ hash })
    };
  }
}

export default SimpleVault;
