// SPDX-License-Identifier: MPL-2.0
pragma solidity ^0.8.0;

import "../SimpleRWA20.sol";

contract SimpleRWA20Factory {
    // Counter to track the total number of created Blox instances
    uint256 public bloxCount;

    // Mapping to store Blox address -> bool (true if valid)
    mapping(address => bool) public isBlox;

    // Event to emit when a new Blox is created
    event BloxCreated(address indexed bloxAddress, address indexed owner);

    /**
     * @notice Creates a new instance of the Blox contract with secure ownership controls.
     * @param _name The name of the token
     * @param _symbol The symbol of the token
     * @param _owner The owner of the new Blox
     * @param _broadcaster The broadcaster address for secure operations
     * @param _recovery The recovery address for secure operations
     * @param _timeLockPeriodInMinutes The timelock period for secure operations (in minutes)
     */
    function createBlox(
        string memory _name,
        string memory _symbol,
        address _owner,
        address _broadcaster,
        address _recovery,
        uint256 _timeLockPeriodInMinutes
    ) external {  
        // Deploy a new SimpleRWA20 instance with secure ownership parameters
        SimpleRWA20 blox = new SimpleRWA20(
            _name,
            _symbol,
            _owner,
            _broadcaster,
            _recovery,
            _timeLockPeriodInMinutes
        );

        // Increment the counter
        bloxCount++;

        // Mark the deployed Blox address as valid in the mapping
        isBlox[address(blox)] = true;

        // Emit an event for the newly created Blox
        emit BloxCreated(address(blox), _owner);
    }

    /**
     * @notice Checks if a given address corresponds to a valid Blox.
     * @param _bloxAddress The address to check.
     * @return True if the address corresponds to a deployed Blox, false otherwise.
     */
    function checkBlox(address _bloxAddress) external view returns (bool) {
        return isBlox[_bloxAddress];
    }
}
