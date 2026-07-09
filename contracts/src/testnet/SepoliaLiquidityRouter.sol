// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address);
}

interface IV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function mint(address to) external returns (uint256 liquidity);
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
}

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title SepoliaLiquidityRouter
/// @notice TESTNET ONLY. Minimal Uniswap v2-compatible router exposing exactly the
///         `addLiquidityETH` surface CurveLaunchpad calls at graduation. Base Sepolia has
///         Uniswap's canonical v2 FACTORY (0x7ae58f10f7849ca6f5fb71b7f45cb416c9204b1e) but no
///         published Router02, so this fills that one gap against the real factory + WETH.
///         Mainnet must use the canonical Uniswap V2 Router02 instead
///         (0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24).
/// @dev Quote logic mirrors Router02's `_addLiquidity` so a pre-seeded pair refunds the unused
///      side instead of reverting, matching what CurveLaunchpad expects at graduation.
contract SepoliaLiquidityRouter {
    IV2Factory public immutable FACTORY;
    // solhint-disable-next-line var-name-mixedcase
    address public immutable WETH;

    error Expired();
    error InsufficientTokenAmount();
    error InsufficientEthAmount();
    error TransferFailed();

    constructor(address factory_, address weth_) {
        FACTORY = IV2Factory(factory_);
        WETH = weth_;
    }

    receive() external payable {}

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        if (block.timestamp > deadline) revert Expired();

        address pair = FACTORY.getPair(token, WETH);
        if (pair == address(0)) pair = FACTORY.createPair(token, WETH);

        (amountToken, amountETH) = _quote(pair, token, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);

        if (!IERC20Minimal(token).transferFrom(msg.sender, pair, amountToken)) revert TransferFailed();
        IWETH(WETH).deposit{value: amountETH}();
        if (!IWETH(WETH).transfer(pair, amountETH)) revert TransferFailed();
        liquidity = IV2Pair(pair).mint(to);

        // Refund the ETH the optimal quote didn't use (pre-seeded pair case).
        if (msg.value > amountETH) {
            (bool ok,) = msg.sender.call{value: msg.value - amountETH}("");
            if (!ok) revert TransferFailed();
        }
    }

    function _quote(
        address pair,
        address token,
        uint256 amountTokenDesired,
        uint256 amountEthDesired,
        uint256 amountTokenMin,
        uint256 amountEthMin
    ) private view returns (uint256 amountToken, uint256 amountEth) {
        (uint112 reserve0, uint112 reserve1,) = IV2Pair(pair).getReserves();
        (uint256 reserveToken, uint256 reserveEth) =
            IV2Pair(pair).token0() == token ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));

        if (reserveToken == 0 && reserveEth == 0) {
            return (amountTokenDesired, amountEthDesired);
        }

        uint256 ethOptimal = (amountTokenDesired * reserveEth) / reserveToken;
        if (ethOptimal <= amountEthDesired) {
            if (ethOptimal < amountEthMin) revert InsufficientEthAmount();
            return (amountTokenDesired, ethOptimal);
        }
        uint256 tokenOptimal = (amountEthDesired * reserveToken) / reserveEth;
        // tokenOptimal <= amountTokenDesired holds by construction here.
        if (tokenOptimal < amountTokenMin) revert InsufficientTokenAmount();
        return (tokenOptimal, amountEthDesired);
    }
}
