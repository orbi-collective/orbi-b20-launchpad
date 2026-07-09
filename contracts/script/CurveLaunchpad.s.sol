// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CurveLaunchpad} from "../src/CurveLaunchpad.sol";
import {SepoliaLiquidityRouter} from "../src/testnet/SepoliaLiquidityRouter.sol";

/// Shared economics defaults, overridable via env:
///   VIRTUAL_ETH       Virtual ETH reserve seeding each curve      (default 1 ether)
///   GRAD_ETH          Real ETH reserve that triggers graduation   (default 4 ether)
///   FEE_BPS           Total trade fee in bps                      (default 100 = 1%)
///   CREATOR_SHARE_BPS Creator's cut of the fee in bps of the fee  (default 5000 = 50/50)
abstract contract CurveDeployBase is Script {
    function _params() internal view returns (uint256 virtualEth, uint256 gradEth, uint256 feeBps, uint256 creatorShareBps) {
        virtualEth = vm.envOr("VIRTUAL_ETH", uint256(1 ether));
        gradEth = vm.envOr("GRAD_ETH", uint256(4 ether));
        feeBps = vm.envOr("FEE_BPS", uint256(100));
        creatorShareBps = vm.envOr("CREATOR_SHARE_BPS", uint256(5_000));
    }

    function _log(CurveLaunchpad pad, address router) internal view {
        console.log("CurveLaunchpad deployed:", address(pad));
        console.log("  VIRTUAL_ETH       :", pad.VIRTUAL_ETH());
        console.log("  GRAD_ETH          :", pad.GRAD_ETH());
        console.log("  FEE_BPS           :", pad.FEE_BPS());
        console.log("  CREATOR_SHARE_BPS :", pad.CREATOR_SHARE_BPS());
        console.log("  ROUTER            :", router);
        console.log("Next: set NEXT_PUBLIC_CURVE_ADDRESS_<chainid> to the launchpad address and redeploy the app.");
    }
}

/// @title DeploySepoliaStack
/// @notice One-shot Base Sepolia deployment: a minimal testnet liquidity router wired to the
///         REAL Uniswap v2 factory on Base Sepolia, then the CurveLaunchpad pointing at it.
///
/// Usage (see also `make deploy-sepolia`):
///   forge script script/CurveLaunchpad.s.sol:DeploySepoliaStack \
///     --rpc-url https://sepolia.base.org --account orbi-deployer \
///     --password-file ~/.orbi/deployer.pass --broadcast
contract DeploySepoliaStack is CurveDeployBase {
    /// Uniswap v2 Factory on Base Sepolia — verified onchain (10k+ pairs) and against
    /// Uniswap's protocol-address registry. WETH is the canonical OP-stack predeploy.
    address internal constant SEPOLIA_V2_FACTORY = 0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;

    function run() external returns (CurveLaunchpad pad, SepoliaLiquidityRouter router) {
        require(block.chainid == 84532, "DeploySepoliaStack: not Base Sepolia");
        (uint256 virtualEth, uint256 gradEth, uint256 feeBps, uint256 creatorShareBps) = _params();

        vm.startBroadcast();
        router = new SepoliaLiquidityRouter(SEPOLIA_V2_FACTORY, WETH);
        pad = new CurveLaunchpad(virtualEth, gradEth, feeBps, creatorShareBps, address(router));
        vm.stopBroadcast();

        console.log("SepoliaLiquidityRouter deployed:", address(router));
        _log(pad, address(router));
    }
}

/// @title DeployCurveLaunchpadMainnet
/// @notice Base Mainnet deployment against the canonical Uniswap V2 Router02
///         (0x4752ba5d... — verified onchain: WETH() == 0x4200...0006, factory() matches
///         Uniswap's registry). Override with ROUTER env if targeting a different v2 DEX.
///
/// SAFETY: the contract custodies user funds and is marked "MUST be audited before mainnet".
/// This script refuses to run without CONFIRM_MAINNET=audited in the env; the Makefile
/// repeats the same gate. Do not bypass it without a completed audit.
contract DeployCurveLaunchpadMainnet is CurveDeployBase {
    address internal constant UNISWAP_V2_ROUTER02_BASE = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;

    function run() external returns (CurveLaunchpad pad) {
        require(block.chainid == 8453, "DeployCurveLaunchpadMainnet: not Base Mainnet");
        require(
            keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) == keccak256("audited"),
            "Refusing mainnet deploy: set CONFIRM_MAINNET=audited only after a completed audit"
        );

        address router = vm.envOr("ROUTER", UNISWAP_V2_ROUTER02_BASE);
        (uint256 virtualEth, uint256 gradEth, uint256 feeBps, uint256 creatorShareBps) = _params();

        vm.startBroadcast();
        pad = new CurveLaunchpad(virtualEth, gradEth, feeBps, creatorShareBps, router);
        vm.stopBroadcast();

        _log(pad, router);
    }
}
