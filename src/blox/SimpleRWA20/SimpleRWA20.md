# SimpleRWA20

SimpleRWA20 is a secure ERC20 token designed for real-world assets (RWA) with enhanced security features. It provides protection beyond standard ERC20 tokens by implementing multi-phase secure operations and guardian account abstraction for critical functions.

## What is SimpleRWA20?

SimpleRWA20 is a specialized ERC20 token for tokenizing real-world assets with built-in security mechanisms. It ensures controlled minting and burning operations with role-based permissions and optional time-locked approvals.

### Key Benefits

- **Enhanced Security**: Multi-phase operations for token minting and burning
- **Role-Based Protection**: Separate access roles (owner, broadcaster, recovery) limit damage if any single key is compromised
- **Meta-Transaction Support**: Gas-efficient operations via delegated transactions
- **Pausable Transfers**: Emergency pause functionality to prevent token transfers when needed
- **Guardian Abstraction**: Advanced security model for critical token operations
- **Standardized Interface**: Full ERC20 compatibility for maximum interoperability

## How SimpleRWA20 Protects Your Assets

Traditional ERC20 tokens are vulnerable to various risks like centralized minting control or insufficient token management security. SimpleRWA20 solves these issues by:

1. **Secure Operation Model**: Critical operations require proper authorization via the GuardianAccountAbstraction
2. **Role Separation**: Different keys for different functions limit the damage of any single compromise
3. **Meta-Transaction Security**: Signed operations that can be broadcasted by a separate entity
4. **Emergency Controls**: Ability to pause all transfers in case of detected security threats

## How to Use SimpleRWA20

### Setting Up Your Token

1. Deploy your SimpleRWA20 contract:
   - Set token name and symbol
   - Set your owner address (main controller)
   - Set a broadcaster address (for meta operations)
   - Set a recovery address (for emergency access)
   - Choose your timelock period

2. Configure operations by adding any additional security constraints

### Managing Your Token

1. **Minting Tokens**: Only possible through secure meta-transactions initiated by the owner and broadcasted by the broadcaster

2. **Burning Tokens**: Controlled destruction of tokens through secure meta-transactions or direct burning with allowances

3. **Transfer Control**: Owner can pause and unpause all token transfers

4. **Meta Operations**: Use meta-transactions to execute operations without directly paying gas fees

### Security Best Practices

1. **Use Separate Devices** for owner, broadcaster, and recovery keys
2. **Establish Strict Controls** on who can mint and burn tokens
3. **Implement Verification Procedures** for minting requests
4. **Regularly Audit** token supply and operation history
5. **Follow Regulatory Requirements** specific to the real-world asset being tokenized
6. **Implement Comprehensive Monitoring** of token operations

---

## For Developers: Technical Documentation

### Architecture

SimpleRWA20 extends multiple contracts to implement a secure ERC20 token with the following key features:

- **ERC20 Base**: Implements the standard ERC20 interface for basic token functionality
- **ERC20Pausable**: Adds the ability to pause all token transfers in emergency situations
- **ERC20Burnable**: Provides secure burning capabilities with allowance checks
- **GuardianAccountAbstraction**: Implements role-based security and multi-phase operations

### Smart Contract Architecture

The SimpleRWA20 contract is implemented in Solidity with a focus on security:

```solidity
contract SimpleRWA20 is ERC20, ERC20Pausable, ERC20Burnable, GuardianAccountAbstraction {
    // Operation types
    bytes32 public constant MINT_TOKENS = keccak256("MINT_TOKENS");
    bytes32 public constant BURN_TOKENS = keccak256("BURN_TOKENS");
    
    // Function selectors
    bytes4 private constant MINT_TOKENS_SELECTOR = bytes4(keccak256("executeMint(address,uint256)"));
    bytes4 private constant BURN_TOKENS_SELECTOR = bytes4(keccak256("executeBurn(address,uint256)"));
    
    // Meta-transaction function selectors
    bytes4 private constant MINT_TOKENS_META_SELECTOR = bytes4(keccak256("mintWithMetaTx((uint256,uint256,uint8,(address,address,uint256,uint256,bytes32,uint8,bytes),bytes,(address,uint256,address,uint256),(uint256,uint256,address,bytes4,uint256,uint256,address),bytes,bytes))"));
    bytes4 private constant BURN_TOKENS_META_SELECTOR = bytes4(keccak256("burnWithMetaTx((uint256,uint256,uint8,(address,address,uint256,uint256,bytes32,uint8,bytes),bytes,(address,uint256,address,uint256),(uint256,uint256,address,bytes4,uint256,uint256,address),bytes,bytes))"));
    
    // Meta transaction parameters
    struct TokenMetaTxParams {
        uint256 deadline;
        uint256 maxGasPrice;
    }
    
    // Events
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    
    // Implementation...
}
```

### TypeScript SDK

The SimpleRWA20 TypeScript SDK provides a client-side interface for interacting with the smart contract:

```typescript
export default class SimpleRWA20 extends GuardianAccountAbstraction {
  // Constants
  static readonly MINT_TOKENS = "MINT_TOKENS";
  static readonly BURN_TOKENS = "BURN_TOKENS";
  
  // Core functionality
  async getTotalSupply(): Promise<bigint>
  async getBalance(account: Address): Promise<bigint>
  async mintWithMetaTx(metaTx: MetaTransaction, options: TransactionOptions): Promise<TransactionResult>
  async burnWithMetaTx(metaTx: MetaTransaction, options: TransactionOptions): Promise<TransactionResult>
  async generateUnsignedMintMetaTx(to: Address, amount: bigint, params: TokenMetaTxParams): Promise<MetaTransaction>
  async generateUnsignedBurnMetaTx(from: Address, amount: bigint, params: TokenMetaTxParams): Promise<MetaTransaction>
  async pause(options: TransactionOptions): Promise<TransactionResult>
  async unpause(options: TransactionOptions): Promise<TransactionResult>
  // Additional methods...
}
```

### Security Model Implementation

#### Role-Based Security

SimpleRWA20 implements a role-based security model with three key roles:

1. **Owner**: Primary administrator with control over token operations and configuration
2. **Broadcaster**: Entity authorized to broadcast signed meta-transactions
3. **Recovery**: Backup access mechanism with limited permissions

This separation of duties creates multiple security layers to prevent unauthorized operations.

#### Controlled Minting and Burning

All token supply modifications follow strict security protocols:

1. **Minting**: New tokens can only be created through the secure meta-transaction flow
   ```solidity
   function mintWithMetaTx(MultiPhaseSecureOperation.MetaTransaction memory metaTx) public onlyBroadcaster
   ```

2. **Burning**: Tokens can be destroyed using similar secure flows
   ```solidity
   function burnWithMetaTx(MultiPhaseSecureOperation.MetaTransaction memory metaTx) public onlyBroadcaster
   ```

3. **Direct Execution**: Actual operations are performed by the contract itself
   ```solidity
   function executeMint(address to, uint256 amount) external
   function executeBurn(address from, uint256 amount) external
   ```

#### Pausable Functionality

In case of security issues, the owner can immediately halt all transfers:
```solidity
function pause() public onlyOwner
function unpause() public onlyOwner
```

### Operation Types

SimpleRWA20 supports the following operation types:

1. **Token Minting**
   - Creates new tokens and assigns them to a specified address
   - Requires proper authorization through meta-transactions
   
2. **Token Burning**
   - Destroys tokens from a specified address
   - Either through meta-transactions or via allowance mechanism
   
3. **Core Operations**
   - Token transfers and approvals
   - Ownership and role management
   - Pause/unpause functionality

### Meta-Transaction Support

SimpleRWA20 implements meta-transactions for gas-efficient operations:

```typescript
async generateUnsignedMintMetaTx(
  to: Address,
  amount: bigint,
  params: TokenMetaTxParams
): Promise<MetaTransaction>

async generateUnsignedBurnMetaTx(
  from: Address,
  amount: bigint,
  params: TokenMetaTxParams
): Promise<MetaTransaction>
```

These functions create unsigned meta-transactions that can be signed by the owner and broadcasted by the designated broadcaster, allowing for operation execution without the owner directly paying gas fees.

### Integration Examples

#### Contract Deployment

SimpleRWA20 requires initialization with critical parameters:

```solidity
constructor(
    string memory name,
    string memory symbol,
    address initialOwner,
    address broadcaster,
    address recovery,
    uint256 timeLockPeriodInMinutes     
) ERC20(name, symbol) GuardianAccountAbstraction(
    initialOwner,
    broadcaster,
    recovery,
    timeLockPeriodInMinutes
)
```

#### TypeScript Integration

To integrate SimpleRWA20 in a TypeScript application:

```typescript
import { SimpleRWA20 } from 'particle-abstraction-sdk';
import { createPublicClient, createWalletClient, http } from 'viem';

// Initialize clients
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http()
});

const walletClient = createWalletClient({
  chain: mainnet,
  transport: http()
});

// Create SimpleRWA20 instance
const token = new SimpleRWA20(
  publicClient,
  walletClient,
  '0xTokenContractAddress',
  mainnet
);

// Generate an unsigned mint meta-transaction
const metaTxParams = {
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
  maxGasPrice: BigInt(50000000000) // 50 gwei
};

const unsignedTx = await token.generateUnsignedMintMetaTx(
  recipientAddress,
  tokenAmount,
  metaTxParams
);

// Sign the transaction with owner's wallet
const signature = await walletClient.signTypedData({
  account: ownerAddress,
  ...createEIP712TypedData(unsignedTx)
});

// Add signature to the transaction
const signedTx = {
  ...unsignedTx,
  signature
};

// Broadcast the signed transaction using broadcaster wallet
await token.mintWithMetaTx(
  signedTx,
  { from: broadcasterAddress }
);
```

#### React UI Integration

The SimpleRWA20 UI can be integrated into any React application:

```tsx
import SimpleRWA20UI from './SimpleRWA20.ui';

function App() {
  return (
    <SimpleRWA20UI 
      contractAddress={tokenAddress}
      onError={(error) => console.error(error)}
    />
  );
}
```

### Developer Best Practices

1. **Controlled Minting**: Implement strict controls and verification processes for token minting
2. **Role Separation**: Use different addresses for owner, broadcaster, and recovery roles
3. **Regular Auditing**: Monitor token supply and transaction history
4. **Meta-Transaction Security**: Verify meta-transaction signatures and parameters before broadcasting
5. **Pause Mechanism**: Establish clear criteria for when to pause token transfers
6. **Regulatory Compliance**: Ensure token operations comply with relevant regulations for the tokenized asset
