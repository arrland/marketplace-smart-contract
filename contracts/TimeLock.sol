pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TimeLock is AccessControl, ReentrancyGuard {
    uint256 public lockPeriod;
    uint256 public constant SECONDS_IN_A_YEAR = 31536000;
    address public marketplaceContract;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    struct LockedToken {
        IERC20 token;
        uint256 amount;
        uint256 unlockTime;
    }

    mapping(address => LockedToken[]) public lockedTokens;

    event TokenLocked(address indexed user, IERC20 indexed token, uint256 amount, uint256 unlockTime, uint256 index);
    event TokenReleased(address indexed user, IERC20 indexed token, uint256 amount, uint256 index);

    constructor(address _admin, address _marketplaceContract) {
        marketplaceContract = _marketplaceContract;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin); // Grant the deployer the default admin role
        _grantRole(ADMIN_ROLE, _admin); // Grant the deployer the admin role
        _grantRole(MARKETPLACE_ROLE, _marketplaceContract); // Directly assign the marketplace role to the marketplace contract
    }

    modifier onlyMarketplaceContract() {
        require(hasRole(MARKETPLACE_ROLE, msg.sender), "Caller does not have marketplace role");
        _;
    }

    function setMarketplaceContractAddress(address _marketplaceContract) public {
        require(hasRole(ADMIN_ROLE, msg.sender), "Caller is not an admin");
        _revokeRole(MARKETPLACE_ROLE, marketplaceContract); // Remove the role from the current marketplace contract
        marketplaceContract = _marketplaceContract;
        _grantRole(MARKETPLACE_ROLE, _marketplaceContract); // Assign the role to the new marketplace contract
    }

    function deposit(address _token, uint256 _amount, address _user, uint256 _unlockTime) external onlyMarketplaceContract { 
        require(_amount > 0, "Amount must be greater than 0.");
        require(IERC20(_token).transferFrom(msg.sender, address(this), _amount), "Token transfer failed.");

        uint256 index = lockedTokens[_user].length;
        lockedTokens[_user].push(LockedToken({
            token: IERC20(_token),
            amount: _amount,
            unlockTime: _unlockTime
        }));

        emit TokenLocked(_user, IERC20(_token), _amount, _unlockTime, index);
    }

    function withdraw(uint256 _index) external nonReentrant {
        LockedToken storage lockedToken = lockedTokens[msg.sender][_index]; 
        require(block.timestamp >= lockedToken.unlockTime, "Tokens are still locked.");
        require(lockedToken.amount > 0, "Token amount already withdrawn.");

        uint256 amount = lockedToken.amount;
        lockedToken.amount = 0;
        require(lockedToken.token.transfer(msg.sender, amount), "Token withdrawal failed.");

        emit TokenReleased(msg.sender, lockedToken.token, amount, _index);
    }

    function getUserLocks(address _user) external view returns (LockedToken[] memory) {
        return lockedTokens[_user];
    }
}
