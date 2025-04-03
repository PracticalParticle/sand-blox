// SPDX-License-Identifier: MPL-2.0
pragma solidity ^0.8.0;

// OpenZeppelin imports
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Particle imports
import "../../particle-core/contracts/GuardianAccountAbstraction.sol";
//import "../../particle-core/contracts/lib/MultiPhaseSecureOperation.sol";

/**
 * @title SimpleRWA20
 * @dev A secure ERC20 token for real-world assets with enhanced security via GuardianAccountAbstraction.
 * Uses MultiPhaseSecureOperation for mint and burn operations, restricted to broadcaster.
 * Implements ERC20Burnable for secure burn operations with allowance checks.
 */
contract SimpleRWA20 is ERC20, ERC20Pausable, ERC20Burnable, GuardianAccountAbstraction {
    using SafeERC20 for IERC20;

    // Constants for operation types
    bytes32 public constant MINT_TOKENS = keccak256("MINT_TOKENS");
    bytes32 public constant BURN_TOKENS = keccak256("BURN_TOKENS");

    // Function selector constants
    bytes4 private constant MINT_TOKENS_SELECTOR = bytes4(keccak256("executeMint(address,uint256)"));
    bytes4 private constant BURN_TOKENS_SELECTOR = bytes4(keccak256("executeBurn(address,uint256)"));

    // Meta-transaction function selectors
    bytes4 private constant MINT_TOKENS_META_SELECTOR = bytes4(keccak256("mintWithMetaTx((uint256,uint256,uint8,(address,address,uint256,uint256,bytes32,uint8,bytes),bytes,(address,uint256,address,uint256),(uint256,uint256,address,bytes4,uint256,uint256,address),bytes,bytes))"));
    bytes4 private constant BURN_TOKENS_META_SELECTOR = bytes4(keccak256("burnWithMetaTx((uint256,uint256,uint8,(address,address,uint256,uint256,bytes32,uint8,bytes),bytes,(address,uint256,address,uint256),(uint256,uint256,address,bytes4,uint256,uint256,address),bytes,bytes))"));

    // Struct for meta-transaction parameters
    struct TokenMetaTxParams {
        uint256 deadline;
        uint256 maxGasPrice;
    }

    // Events for important token operations
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    /**
     * @notice Constructor to initialize SimpleRWA20
     * @param name The name of the token
     * @param symbol The symbol of the token
     * @param initialOwner The initial owner address
     * @param broadcaster The broadcaster address
     * @param recovery The recovery address
     * @param timeLockPeriodInMinutes The timelock period in minutes
     */
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
    ) {
        // Add operation types with human-readable names
        MultiPhaseSecureOperation.ReadableOperationType memory mintOp = MultiPhaseSecureOperation.ReadableOperationType({
            operationType: MINT_TOKENS,
            name: "MINT_TOKENS"
        });
        
        MultiPhaseSecureOperation.ReadableOperationType memory burnOp = MultiPhaseSecureOperation.ReadableOperationType({
            operationType: BURN_TOKENS,
            name: "BURN_TOKENS"
        });
        
        MultiPhaseSecureOperation.addOperationType(_getSecureState(), mintOp);
        MultiPhaseSecureOperation.addOperationType(_getSecureState(), burnOp);
        
        // Add meta-transaction function selector permissions for broadcaster
        MultiPhaseSecureOperation.addRoleForFunction(_getSecureState(), MINT_TOKENS_META_SELECTOR, MultiPhaseSecureOperation.BROADCASTER_ROLE);
        MultiPhaseSecureOperation.addRoleForFunction(_getSecureState(), BURN_TOKENS_META_SELECTOR, MultiPhaseSecureOperation.BROADCASTER_ROLE);
    }

    /**
     * @notice Create a mint request and immediately execute it via meta-transaction (single phase)
     * @param metaTx Meta transaction data containing mint parameters
     * @return The transaction record
     */
    function mintWithMetaTx(MultiPhaseSecureOperation.MetaTransaction memory metaTx) 
        public 
        onlyBroadcaster 
        returns (MultiPhaseSecureOperation.TxRecord memory) 
    {
        MultiPhaseSecureOperation.checkPermission(_getSecureState(), MINT_TOKENS_META_SELECTOR);
        require(metaTx.params.handlerSelector == MINT_TOKENS_META_SELECTOR, "Invalid handler selector");
        
        MultiPhaseSecureOperation.TxRecord memory txRecord = MultiPhaseSecureOperation.requestAndApprove(
            _getSecureState(),
            metaTx
        );
        
        require(txRecord.params.operationType == MINT_TOKENS, "Invalid operation type");
        addOperation(txRecord);
        finalizeOperation(txRecord);
        return txRecord;
    }

    /**
     * @notice Create a burn request and immediately execute it via meta-transaction (single phase)
     * @param metaTx Meta transaction data containing burn parameters
     * @return The transaction record
     */
    function burnWithMetaTx(MultiPhaseSecureOperation.MetaTransaction memory metaTx) 
        public 
        onlyBroadcaster 
        returns (MultiPhaseSecureOperation.TxRecord memory) 
    {
        MultiPhaseSecureOperation.checkPermission(_getSecureState(), BURN_TOKENS_META_SELECTOR);
        require(metaTx.params.handlerSelector == BURN_TOKENS_META_SELECTOR, "Invalid handler selector");
        
        MultiPhaseSecureOperation.TxRecord memory txRecord = MultiPhaseSecureOperation.requestAndApprove(
            _getSecureState(),
            metaTx
        );
        
        require(txRecord.params.operationType == BURN_TOKENS, "Invalid operation type");
        addOperation(txRecord);
        finalizeOperation(txRecord);
        return txRecord;
    }

    /**
     * @notice Generates an unsigned meta-transaction for minting tokens
     * @param to Recipient address
     * @param amount Amount of tokens to mint
     * @param params Parameters for the meta-transaction
     * @return MetaTransaction The unsigned meta-transaction ready for signing
     */
    function generateUnsignedMintMetaTx(
        address to, 
        uint256 amount,
        TokenMetaTxParams memory params
    ) public view returns (MultiPhaseSecureOperation.MetaTransaction memory) {
        require(to != address(0), "Invalid recipient");
        
        // Create execution options
        bytes memory executionOptions = MultiPhaseSecureOperation.createStandardExecutionOptions(
            MINT_TOKENS_SELECTOR,
            abi.encode(to, amount)
        );
        
        // Create meta-transaction parameters
        MultiPhaseSecureOperation.MetaTxParams memory metaTxParams = createMetaTxParams(
            address(this),
            MINT_TOKENS_META_SELECTOR,
            params.deadline,
            params.maxGasPrice,
            owner()
        );
        
        // Generate the unsigned meta-transaction
        return generateUnsignedMetaTransactionForNew(
            owner(),
            address(this),
            0, // no value
            gasleft(),
            MINT_TOKENS,
            MultiPhaseSecureOperation.ExecutionType.STANDARD,
            executionOptions,
            metaTxParams
        );
    }

    /**
     * @notice Generates an unsigned meta-transaction for burning tokens
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     * @param params Parameters for the meta-transaction
     * @return MetaTransaction The unsigned meta-transaction ready for signing
     */
    function generateUnsignedBurnMetaTx(
        address from, 
        uint256 amount,
        TokenMetaTxParams memory params
    ) public view returns (MultiPhaseSecureOperation.MetaTransaction memory) {
        require(from != address(0), "Invalid address");
        require(balanceOf(from) >= amount, "Insufficient balance");
        
        // Create execution options
        bytes memory executionOptions = MultiPhaseSecureOperation.createStandardExecutionOptions(
            BURN_TOKENS_SELECTOR,
            abi.encode(from, amount)
        );
        
        // Create meta-transaction parameters
        MultiPhaseSecureOperation.MetaTxParams memory metaTxParams = createMetaTxParams(
            address(this),
            BURN_TOKENS_META_SELECTOR,
            params.deadline,
            params.maxGasPrice,
            owner()
        );
        
        // Generate the unsigned meta-transaction
        return generateUnsignedMetaTransactionForNew(
            owner(),
            address(this),
            0, // no value
            gasleft(),
            BURN_TOKENS,
            MultiPhaseSecureOperation.ExecutionType.STANDARD,
            executionOptions,
            metaTxParams
        );
    }

    /**
     * @dev External function that can only be called by the contract itself to execute minting
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function executeMint(address to, uint256 amount) external {
        require(msg.sender == address(this), "Only callable by contract itself");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @dev External function that can only be called by the contract itself to execute burning
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function executeBurn(address from, uint256 amount) external {
        require(msg.sender == address(this), "Only callable by contract itself");
        // Use burnFrom from ERC20Burnable which handles allowance checks
        burnFrom(from, amount);
        emit TokensBurned(from, amount);
    }

    /**
     * @notice Pauses all token transfers, only callable by the owner
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses all token transfers, only callable by the owner
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev Hook that is called during any token transfer
     * This includes minting and burning.
     * Overrides functionality from ERC20, ERC20Pausable, and ERC20Burnable.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @dev Internal function to add an operation to the history
     * @param txRecord The transaction record
     */
    function addOperation(MultiPhaseSecureOperation.TxRecord memory txRecord) internal override {
        // Additional custom logic for operation tracking can be added here
    }

    /**
     * @dev Internal function to finalize an operation
     * @param txRecord The transaction record
     */
    function finalizeOperation(MultiPhaseSecureOperation.TxRecord memory txRecord) internal override {
        // Additional custom logic for operation finalization can be added here
    }
}
