// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SepoliaLiquidityRouter, IV2Factory, IV2Pair} from "../src/testnet/SepoliaLiquidityRouter.sol";

contract TestToken {
    string public name = "Fork Probe";
    string public symbol = "PROBE";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        return true;
    }
}

/// @notice Fork test against the REAL Uniswap v2 factory + WETH on Base Sepolia, proving the
///         testnet router creates a pair, deposits both sides, and mints LP to the target —
///         the exact call CurveLaunchpad makes at graduation. Skipped unless FORK_SEPOLIA=true
///         so the default suite stays offline-deterministic.
contract SepoliaLiquidityRouterForkTest is Test {
    address internal constant SEPOLIA_V2_FACTORY = 0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function test_fork_addLiquidityETH_freshPair_lpToDead() public {
        if (!vm.envOr("FORK_SEPOLIA", false)) {
            vm.skip(true);
        }
        vm.createSelectFork(vm.envOr("BASE_SEPOLIA_RPC_URL", string("https://sepolia.base.org")));

        SepoliaLiquidityRouter router = new SepoliaLiquidityRouter(SEPOLIA_V2_FACTORY, WETH);
        TestToken token = new TestToken();
        token.mint(address(this), 1_000_000 ether);
        token.approve(address(router), type(uint256).max);
        vm.deal(address(this), 10 ether);

        (uint256 amountToken, uint256 amountEth, uint256 liquidity) =
            router.addLiquidityETH{value: 1 ether}(address(token), 500_000 ether, 0, 0, DEAD, block.timestamp);

        assertEq(amountToken, 500_000 ether, "all tokens deposited on fresh pair");
        assertEq(amountEth, 1 ether, "all ETH deposited on fresh pair");
        assertGt(liquidity, 0, "LP minted");

        address pair = IV2Factory(SEPOLIA_V2_FACTORY).getPair(address(token), WETH);
        assertTrue(pair != address(0), "pair exists on the real factory");
        (uint112 r0, uint112 r1,) = IV2Pair(pair).getReserves();
        assertGt(uint256(r0) * uint256(r1), 0, "reserves seeded");
    }
}
