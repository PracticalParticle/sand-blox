import { Address, createPublicClient, http, Abi } from 'viem';
import { sepolia } from 'viem/chains';
import FACTORY_ABI from './SimpleRWA20Factory.abi.json';

export class SimpleRWA20Factory {
  private client;

  constructor() {
    // Initialize public client for Sepolia
    this.client = createPublicClient({
      chain: sepolia,
      transport: http()
    });
  }

  /**
   * Creates a new SimpleRWA20 token instance
   * @param params Creation parameters
   * @returns Transaction data
   */
  async createBlox(params: {
    name: string;
    symbol: string;
    owner: Address;
    broadcaster: Address;
    recovery: Address;
    timeLockPeriodInMinutes: number;
  }) {
    const { 
      name,
      symbol,
      owner, 
      broadcaster, 
      recovery, 
      timeLockPeriodInMinutes 
    } = params;
    
    // Get factory address from config
    const factoryAddress = this.getFactoryAddress();

    // Prepare transaction data
    const data = {
      address: factoryAddress,
      abi: FACTORY_ABI as Abi,
      functionName: 'createBlox',
      args: [name, symbol, owner, broadcaster, recovery, BigInt(timeLockPeriodInMinutes)]
    };

    return data;
  }

  /**
   * Checks if an address is a valid SimpleRWA20 token
   */
  async isValidBlox(bloxAddress: Address): Promise<boolean> {
    const factoryAddress = this.getFactoryAddress();
    
    return this.client.readContract({
      address: factoryAddress,
      abi: FACTORY_ABI as Abi,
      functionName: 'checkBlox',
      args: [bloxAddress]
    }) as Promise<boolean>;
  }

  /**
   * Gets the total number of tokens created
   */
  async getBloxCount(): Promise<bigint> {
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
    const config = require('../SimpleRWA20.blox.json');
    const networkId = sepolia.id;

    if (!config.deployments?.[networkId]?.factory) {
      throw new Error(`No factory deployment found for network ${networkId}`);
    }

    return config.deployments[networkId].factory as Address;
  }
}
