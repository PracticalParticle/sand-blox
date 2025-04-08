import { Address, PublicClient, Abi } from 'viem';
import FACTORY_ABI from './SimpleVaultFactory.abi.json';

export class SimpleVaultFactory {
  private client: PublicClient;

  constructor(client: PublicClient) {
    this.client = client;
  }

  /**
   * Creates a new SimpleVault instance
   * @param params Creation parameters
   * @returns Transaction hash
   */
  async createVault(params: {
    owner: Address;
    broadcaster: Address;
    recovery: Address;
    timeLockPeriodInMinutes: number;
  }) {
    const { owner, broadcaster, recovery, timeLockPeriodInMinutes } = params;
    
    // Get factory address from config
    const factoryAddress = this.getFactoryAddress();

    // Prepare transaction data
    const data = {
      address: factoryAddress,
      abi: FACTORY_ABI as Abi,
      functionName: 'createBlox',
      args: [owner, broadcaster, recovery, BigInt(timeLockPeriodInMinutes)]
    };

    return data;
  }

  /**
   * Checks if an address is a valid SimpleVault
   */
  async isValidVault(bloxAddress: Address): Promise<boolean> {
    const factoryAddress = this.getFactoryAddress();
    
    return this.client.readContract({
      address: factoryAddress,
      abi: FACTORY_ABI as Abi,
      functionName: 'checkBlox',
      args: [bloxAddress]
    }) as Promise<boolean>;
  }

  /**
   * Gets the total number of vaults created
   */
  async getVaultCount(): Promise<bigint> {
    const factoryAddress = this.getFactoryAddress();
    
    return this.client.readContract({
      address: factoryAddress,
      abi: FACTORY_ABI as Abi,
      functionName: 'bloxCount'
    }) as Promise<bigint>;
  }

  /**
   * Gets the factory address for the current network
   */
  private getFactoryAddress(): Address {
    // Import deployment addresses from blox.json
    const config = require('../SimpleVault.blox.json');
    const networkId = this.client.chain?.id;

    if (!networkId) {
      throw new Error('No chain connected');
    }

    if (!config.deployments?.[networkId]?.factory) {
      throw new Error(`No factory deployment found for network ${networkId}`);
    }

    return config.deployments[networkId].factory as Address;
  }
}
