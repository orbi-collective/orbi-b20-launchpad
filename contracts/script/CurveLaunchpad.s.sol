// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CurveLaunchpad} from "../src/CurveLaunchpad.sol";

/// @title DeployCurveLaunchpad
/// @notice Deploys CurveLaunchpad with economics read from env so Sepolia and mainnet
///         use the same script.
///
/// Required env:
///   ROUTER            Uniswap v2-compatible router used at graduation (chain-specific).
/// Optional env (defaults shown):
///   VIRTUAL_ETH       Virtual ETH reserve seeding each curve      (default 1 ether)
///   GRAD_ETH          Real ETH reserve that triggers graduation   (default 4 ether)
///   FEE_BPS           Total trade fee in bps                      (default 100 = 1%)
///   CREATOR_SHARE_BPS Creator's cut of the fee in bps of the fee  (default 5000 = 50/50)
///
/// Usage:
///   forge script script/CurveLaunchpad.s.sol:DeployCurveLaunchpad \
///     --rpc-url "$BASE_SEPOLIA_RPC_URL" --account <keystore-name> --broadcast
///
/// After broadcast, put the printed address in the frontend env:
///   NEXT_PUBLIC_CURVE_ADDRESS_84532 (Sepolia) / NEXT_PUBLIC_CURVE_ADDRESS_8453 (mainnet).
contract DeployCurveLaunchpad is Script {
    function run() external returns (CurveLaunchpad pad) {
        address router = vm.envAddress("ROUTER");
        uint256 virtualEth = vm.envOr("VIRTUAL_ETH", uint256(1 ether));
        uint256 gradEth = vm.envOr("GRAD_ETH", uint256(4 ether));
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(100));
        uint256 creatorShareBps = vm.envOr("CREATOR_SHARE_BPS", uint256(5_000));

        vm.startBroadcast();
        pad = new CurveLaunchpad(virtualEth, gradEth, feeBps, creatorShareBps, router);
        vm.stopBroadcast();

        console.log("CurveLaunchpad deployed:", address(pad));
        console.log("  VIRTUAL_ETH       :", virtualEth);
        console.log("  GRAD_ETH          :", gradEth);
        console.log("  FEE_BPS           :", feeBps);
        console.log("  CREATOR_SHARE_BPS :", creatorShareBps);
        console.log("  ROUTER            :", router);
    }
}
