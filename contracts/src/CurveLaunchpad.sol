// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdPrecompiles} from "base-std/StdPrecompiles.sol";
import {IB20Factory} from "base-std/interfaces/IB20Factory.sol";
import {IB20} from "base-std/interfaces/IB20.sol";
import {B20Constants} from "base-std/lib/B20Constants.sol";
import {B20FactoryLib} from "base-std/lib/B20FactoryLib.sol";

/// @dev Minimal Uniswap v2 router surface used at graduation.
interface IUniswapV2Router {
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

/// @title CurveLaunchpad
/// @notice Bonding-curve launchpad for native B20 tokens on Base (pump-style).
///
/// Lifecycle:
///  1. `launch` deploys a real native B20 (Asset, 18 decimals) through the Factory precompile
///     with `initialAdmin = address(0)`: the token NEVER has an admin. Inside the creation
///     window the full 1B supply is minted to this contract, the supply cap is pinned to it,
///     BURN_ROLE is granted to this contract (used only to burn its own excess at graduation),
///     and `contractURI` is set. No mint, no pause, no policy control exists afterwards.
///  2. `buy` / `sell` trade against a constant-product curve with a virtual ETH reserve.
///     A flat fee (bps) is taken per trade and split creator / protocol, both pull-claimed.
///     Once the pool's real ETH reserve reaches `GRAD_ETH` the curve is "full": buys revert,
///     but sells stay open so holders always keep an exit until liquidity actually migrates.
///  3. Anyone then calls `graduate`: ETH + spot-price-matched tokens are deposited into a
///     Uniswap v2 pair, the LP tokens are sent to the dead address (liquidity locked forever),
///     the remaining curve tokens are burned, and curve trading closes.
///
/// Graduation is a separate, permissionless call (not folded into `buy`) with slippage-bounded
/// deposit mins, so a pre-seeded / manipulated pair reverts the deposit instead of migrating
/// liquidity at an attacker-chosen price. A blocked graduation rolls back and can be retried;
/// funds are never stranded because sells stay open until it succeeds.
///
/// Funds note: this contract custodies pool reserves and unclaimed fees. It is intentionally
/// minimal (no upgrades, no admin mint, immutable economics) and MUST be audited before mainnet.
contract CurveLaunchpad {
    // ---------------------------------------------------------------- constants & immutables
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether; // 1B tokens, 18 decimals
    uint256 public constant BPS = 10_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    /// @notice Max deviation the graduation deposit tolerates from the curve's closing ratio.
    ///         The router reverts rather than depositing outside this band, so a manipulated
    ///         pair can't skew the opening DEX price. 200 = 2%.
    uint256 public constant GRAD_MAX_SLIPPAGE_BPS = 200;

    /// @notice Virtual ETH reserve seeding each curve (sets the starting price).
    uint256 public immutable VIRTUAL_ETH;
    /// @notice Real ETH reserve at which a pool graduates to the DEX.
    uint256 public immutable GRAD_ETH;
    /// @notice Total trade fee in bps (e.g. 100 = 1%).
    uint256 public immutable FEE_BPS;
    /// @notice Creator's share of the trade fee in bps of the fee (5000 = 50/50).
    uint256 public immutable CREATOR_SHARE_BPS;
    /// @notice Uniswap v2-compatible router used at graduation.
    IUniswapV2Router public immutable ROUTER;

    address public owner;
    uint256 public protocolFees;

    // ---------------------------------------------------------------- pool state
    struct Pool {
        address creator;
        uint128 realEth; // ETH held for this curve (excludes fees)
        uint128 tokenReserve; // virtual == physical token reserve while bonding
        bool graduated;
    }

    mapping(address => Pool) public pools; // token => pool
    mapping(address => uint256) public creatorFees; // token => claimable wei

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events
    event Launched(address indexed token, address indexed creator, string name, string symbol, string contractURI);
    event Trade(
        address indexed token,
        address indexed trader,
        bool indexed isBuy,
        uint256 ethAmount, // net ETH into/out of the curve (fee excluded)
        uint256 tokenAmount,
        uint256 fee,
        uint256 realEth, // post-trade reserves, so indexers can derive spot price
        uint256 tokenReserve
    );
    event Graduated(address indexed token, uint256 ethToLp, uint256 tokensToLp, uint256 tokensBurned);
    event FeesClaimed(address indexed token, address indexed creator, uint256 amount);

    // ---------------------------------------------------------------- errors
    error BadParams();
    error UnknownToken();
    error AlreadyGraduated();
    error CurveFull();
    error NotReadyToGraduate();
    error ZeroAmount();
    error Slippage();
    error NotCreator();
    error NotOwner();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(uint256 virtualEth, uint256 gradEth, uint256 feeBps, uint256 creatorShareBps, address router) {
        if (virtualEth == 0 || gradEth == 0 || feeBps > 1_000 || creatorShareBps > BPS || router == address(0)) {
            revert BadParams();
        }
        VIRTUAL_ETH = virtualEth;
        GRAD_ETH = gradEth;
        FEE_BPS = feeBps;
        CREATOR_SHARE_BPS = creatorShareBps;
        ROUTER = IUniswapV2Router(router);
        owner = msg.sender;
    }

    // ---------------------------------------------------------------- launch
    /// @notice Deploys an admin-less native B20 and opens its bonding curve.
    /// @param userSalt Caller-scoped salt; the effective factory salt is keccak(creator, userSalt)
    ///                 so two creators can never collide.
    function launch(string calldata name, string calldata symbol, string calldata contractURI, bytes32 userSalt)
        external
        returns (address token)
    {
        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert BadParams();

        bytes32 salt = keccak256(abi.encode(msg.sender, userSalt));
        bytes memory params = B20FactoryLib.encodeAssetCreateParams(name, symbol, address(0), 18);

        bytes[] memory initCalls = new bytes[](4);
        initCalls[0] = abi.encodeCall(IB20.mint, (address(this), TOTAL_SUPPLY));
        initCalls[1] = B20FactoryLib.encodeUpdateSupplyCap(TOTAL_SUPPLY);
        initCalls[2] = B20FactoryLib.encodeGrantRole(B20Constants.BURN_ROLE, address(this));
        initCalls[3] = B20FactoryLib.encodeUpdateContractURI(contractURI);

        token = StdPrecompiles.B20_FACTORY.createB20(IB20Factory.B20Variant.ASSET, salt, params, initCalls);

        pools[token] = Pool({
            creator: msg.sender,
            realEth: 0,
            tokenReserve: uint128(TOTAL_SUPPLY),
            graduated: false
        });

        emit Launched(token, msg.sender, name, symbol, contractURI);
    }

    // ---------------------------------------------------------------- trading
    /// @notice Buys `token` from its curve with the attached ETH. Reverts if fewer than
    ///         `minTokensOut` tokens would be received. Triggers graduation when the pool's
    ///         real reserve crosses the target.
    function buy(address token, uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        Pool storage pool = _livePool(token);
        if (msg.value == 0) revert ZeroAmount();
        // Curve is full once it hits the target; it must graduate before trading resumes.
        // Selling stays open (see `sell`), so holders keep an exit even while full.
        if (pool.realEth >= GRAD_ETH) revert CurveFull();

        uint256 fee = (msg.value * FEE_BPS) / BPS;
        uint256 ethNet = msg.value - fee;

        uint256 vEth = VIRTUAL_ETH + pool.realEth;
        uint256 k = VIRTUAL_ETH * TOTAL_SUPPLY;
        uint256 newVTok = k / (vEth + ethNet);
        tokensOut = pool.tokenReserve - newVTok;
        if (tokensOut < minTokensOut || tokensOut == 0) revert Slippage();

        pool.realEth += uint128(ethNet);
        pool.tokenReserve = uint128(newVTok);
        _accrueFee(token, pool, fee);

        if (!IB20(token).transfer(msg.sender, tokensOut)) revert TransferFailed();
        emit Trade(token, msg.sender, true, ethNet, tokensOut, fee, pool.realEth, pool.tokenReserve);
    }

    /// @notice Returns true once a pool has filled its curve and is waiting to graduate.
    function isReadyToGraduate(address token) external view returns (bool) {
        Pool storage pool = pools[token];
        return pool.creator != address(0) && !pool.graduated && pool.realEth >= GRAD_ETH;
    }

    /// @notice Permissionless: migrates a full pool's liquidity to the DEX. Reverts (and can be
    ///         retried) if the target pair is manipulated beyond `GRAD_MAX_SLIPPAGE_BPS`.
    function graduate(address token) external nonReentrant {
        Pool storage pool = pools[token];
        if (pool.creator == address(0)) revert UnknownToken();
        if (pool.graduated) revert AlreadyGraduated();
        if (pool.realEth < GRAD_ETH) revert NotReadyToGraduate();
        _graduate(token, pool);
    }

    /// @notice Sells `tokenAmount` of `token` back to its curve (requires prior approval).
    ///         Reverts if the net ETH out would be below `minEthOut`.
    function sell(address token, uint256 tokenAmount, uint256 minEthOut)
        external
        nonReentrant
        returns (uint256 ethOut)
    {
        Pool storage pool = _livePool(token);
        if (tokenAmount == 0) revert ZeroAmount();

        uint256 vEth = VIRTUAL_ETH + pool.realEth;
        uint256 k = VIRTUAL_ETH * TOTAL_SUPPLY;
        uint256 newVTok = pool.tokenReserve + tokenAmount;
        uint256 ethGross = vEth - (k / newVTok);
        uint256 fee = (ethGross * FEE_BPS) / BPS;
        ethOut = ethGross - fee;
        if (ethOut < minEthOut || ethOut == 0) revert Slippage();

        pool.realEth -= uint128(ethGross);
        pool.tokenReserve = uint128(newVTok);
        _accrueFee(token, pool, fee);

        if (!IB20(token).transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();
        (bool ok,) = msg.sender.call{value: ethOut}("");
        if (!ok) revert TransferFailed();

        emit Trade(token, msg.sender, false, ethGross, tokenAmount, fee, pool.realEth, pool.tokenReserve);
    }

    /// @notice Spot price of the curve in ETH wei per whole token (1e18 base units).
    function spotPrice(address token) external view returns (uint256) {
        Pool storage pool = pools[token];
        if (pool.creator == address(0)) revert UnknownToken();
        return ((VIRTUAL_ETH + uint256(pool.realEth)) * 1 ether) / pool.tokenReserve;
    }

    // ---------------------------------------------------------------- fees
    function claimFees(address token) external nonReentrant returns (uint256 amount) {
        if (msg.sender != pools[token].creator) revert NotCreator();
        amount = creatorFees[token];
        creatorFees[token] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit FeesClaimed(token, msg.sender, amount);
    }

    function withdrawProtocol(address to) external nonReentrant returns (uint256 amount) {
        if (msg.sender != owner) revert NotOwner();
        amount = protocolFees;
        protocolFees = 0;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ---------------------------------------------------------------- internals
    function _livePool(address token) private view returns (Pool storage pool) {
        pool = pools[token];
        if (pool.creator == address(0)) revert UnknownToken();
        if (pool.graduated) revert AlreadyGraduated();
    }

    function _accrueFee(address token, Pool storage pool, uint256 fee) private {
        if (fee == 0) return;
        uint256 creatorCut = (fee * CREATOR_SHARE_BPS) / BPS;
        creatorFees[token] += creatorCut;
        protocolFees += fee - creatorCut;
        // silence unused warning; pool passed for future per-pool fee logic
        pool;
    }

    /// @dev Deposits the pool's ETH plus spot-price-matched tokens into a v2 pair, sends the LP
    ///      tokens to the dead address, and burns every remaining curve token so the DEX opens at
    ///      the curve's closing price with no overhang.
    ///
    ///      Deposit mins are set to `GRAD_MAX_SLIPPAGE_BPS` below the curve amounts. Against a
    ///      fresh pair the full amounts deposit and the mins never bind. Against a pre-seeded /
    ///      donated pair whose ratio is skewed, the router can only deposit at that skewed ratio,
    ///      which falls below the mins and reverts — so an attacker can't force liquidity to
    ///      migrate at a price they chose. State is rolled back on revert, so `graduate` can be
    ///      retried once the pair is clean; meanwhile sells remain open on the still-live pool.
    function _graduate(address token, Pool storage pool) private {
        uint256 ethLp = pool.realEth;
        uint256 vEth = VIRTUAL_ETH + ethLp;
        uint256 tokensLp = (ethLp * pool.tokenReserve) / vEth;

        uint256 minToken = tokensLp - (tokensLp * GRAD_MAX_SLIPPAGE_BPS) / BPS;
        uint256 minEth = ethLp - (ethLp * GRAD_MAX_SLIPPAGE_BPS) / BPS;

        pool.graduated = true;
        pool.realEth = 0;

        IB20(token).approve(address(ROUTER), tokensLp);
        ROUTER.addLiquidityETH{value: ethLp}(token, tokensLp, minToken, minEth, DEAD, block.timestamp);

        uint256 leftover = IB20(token).balanceOf(address(this));
        if (leftover > 0) IB20(token).burn(leftover);

        emit Graduated(token, ethLp, tokensLp, leftover);
    }

    receive() external payable {} // router ETH refunds at graduation
}
