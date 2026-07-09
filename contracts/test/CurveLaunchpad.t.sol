// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "base-std-test/lib/BaseTest.sol";
import {IB20} from "base-std/interfaces/IB20.sol";
import {CurveLaunchpad} from "../src/CurveLaunchpad.sol";

/// @dev Records the graduation deposit instead of talking to a real DEX.
contract MockV2Router {
    address public lastToken;
    uint256 public lastTokenAmount;
    uint256 public lastEthAmount;
    address public lastLpRecipient;
    uint256 public calls;

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address to,
        uint256
    ) external payable returns (uint256, uint256, uint256) {
        IB20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        lastToken = token;
        lastTokenAmount = amountTokenDesired;
        lastEthAmount = msg.value;
        lastLpRecipient = to;
        calls += 1;
        return (amountTokenDesired, msg.value, 1e18);
    }
}

/// @notice Exercises the bonding-curve launchpad against base-std's reference B20 mocks
///         (BaseTest.setUp etches the precompiles and activates the Asset feature).
contract CurveLaunchpadTest is BaseTest {
    uint256 constant V_ETH = 1 ether;
    uint256 constant GRAD = 0.5 ether;
    uint256 constant FEE = 100; // 1%
    uint256 constant CREATOR_SHARE = 5_000; // 50/50
    uint256 constant SUPPLY = 1_000_000_000 ether;
    uint256 constant K = V_ETH * SUPPLY;

    CurveLaunchpad internal pad;
    MockV2Router internal router;
    address internal creator = makeAddr("creator");
    address internal trader = makeAddr("trader");

    function setUp() public override {
        super.setUp();
        router = new MockV2Router();
        pad = new CurveLaunchpad(V_ETH, GRAD, FEE, CREATOR_SHARE, address(router));
        vm.deal(trader, 100 ether);
    }

    function _launch() internal returns (address token) {
        vm.prank(creator);
        token = pad.launch("Beryl Frog", "FROG", "ipfs://frog", keccak256("s1"));
    }

    // ---------------------------------------------------------------- launch
    function test_launch_deploysAdminlessNativeB20() public {
        address token = _launch();
        assertEq(IB20(token).symbol(), "FROG", "native B20 deployed with symbol");
        assertEq(IB20(token).totalSupply(), SUPPLY, "full supply minted");
        assertEq(IB20(token).balanceOf(address(pad)), SUPPLY, "curve holds everything");
        assertFalse(IB20(token).hasRole(bytes32(0), creator), "creator has no admin role");
        assertFalse(IB20(token).hasRole(bytes32(0), address(pad)), "launchpad has no admin role");
        (address c,,, bool grad) = pad.pools(token);
        assertEq(c, creator, "creator recorded");
        assertFalse(grad, "not graduated");
    }

    function test_launch_sameSaltDifferentCreators_noCollision() public {
        vm.prank(creator);
        address a = pad.launch("A", "AAA", "", keccak256("same"));
        vm.prank(trader);
        address b = pad.launch("B", "BBB", "", keccak256("same"));
        assertTrue(a != b, "creator-scoped salt");
    }

    // ---------------------------------------------------------------- trading
    function test_buy_transfersTokensAndSplitsFee() public {
        address token = _launch();
        uint256 pay = 0.1 ether;
        uint256 fee = (pay * FEE) / 10_000;
        uint256 net = pay - fee;
        uint256 expectedOut = SUPPLY - K / (V_ETH + net);

        vm.prank(trader);
        uint256 out = pad.buy{value: pay}(token, 0);

        assertEq(out, expectedOut, "curve math");
        assertEq(IB20(token).balanceOf(trader), expectedOut, "tokens delivered");
        assertEq(pad.creatorFees(token), fee / 2, "creator gets 50% of fee");
        assertEq(pad.protocolFees(), fee - fee / 2, "protocol gets the rest");
        (, uint128 realEth,,) = pad.pools(token);
        assertEq(uint256(realEth), net, "real reserve tracks net ETH");
    }

    function test_sell_roundTripReturnsEthMinusFees() public {
        address token = _launch();
        vm.startPrank(trader);
        uint256 out = pad.buy{value: 0.1 ether}(token, 0);

        IB20(token).approve(address(pad), out);
        uint256 balBefore = trader.balance;
        uint256 ethOut = pad.sell(token, out, 0);
        vm.stopPrank();

        assertEq(trader.balance - balBefore, ethOut, "ETH paid out");
        // Full round trip: reserves return to genesis, trader eats both fees.
        (, uint128 realEth, uint128 tokenReserve,) = pad.pools(token);
        assertEq(uint256(realEth), 0, "reserve back to zero");
        assertEq(uint256(tokenReserve), SUPPLY, "token reserve restored");
        assertLt(ethOut, 0.1 ether, "fees make round trip lossy");
        // Contract still holds every wei owed to fee claimants.
        assertEq(address(pad).balance, pad.protocolFees() + pad.creatorFees(token), "solvent after round trip");
    }

    function test_buy_slippageReverts() public {
        address token = _launch();
        vm.prank(trader);
        vm.expectRevert(CurveLaunchpad.Slippage.selector);
        pad.buy{value: 0.1 ether}(token, type(uint256).max);
    }

    function test_sell_slippageReverts() public {
        address token = _launch();
        vm.startPrank(trader);
        uint256 out = pad.buy{value: 0.1 ether}(token, 0);
        IB20(token).approve(address(pad), out);
        vm.expectRevert(CurveLaunchpad.Slippage.selector);
        pad.sell(token, out, type(uint256).max);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- graduation
    function test_buy_crossingTarget_graduates() public {
        address token = _launch();
        vm.prank(trader);
        pad.buy{value: 0.6 ether}(token, 0); // net 0.594 > 0.5 target

        (, uint128 realEth,, bool grad) = pad.pools(token);
        assertTrue(grad, "pool graduated");
        assertEq(uint256(realEth), 0, "reserve moved to LP");
        assertEq(router.calls(), 1, "router called once");
        assertGt(router.lastEthAmount(), GRAD, "all real ETH deposited");
        assertEq(router.lastLpRecipient(), pad.DEAD(), "LP locked at dead address");
        assertEq(IB20(token).balanceOf(address(pad)), 0, "leftover curve tokens burned");
        assertLt(IB20(token).totalSupply(), SUPPLY, "burn shrank supply");
        // LP priced at the curve's closing spot price: tokensLp = eth * tokenReserve / vEth.
        assertGt(router.lastTokenAmount(), 0, "tokens deposited");
    }

    function test_trade_afterGraduation_reverts() public {
        address token = _launch();
        vm.startPrank(trader);
        pad.buy{value: 0.6 ether}(token, 0);
        vm.expectRevert(CurveLaunchpad.AlreadyGraduated.selector);
        pad.buy{value: 0.01 ether}(token, 0);
        vm.expectRevert(CurveLaunchpad.AlreadyGraduated.selector);
        pad.sell(token, 1 ether, 0);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- fees
    function test_claimFees_paysCreatorOnly() public {
        address token = _launch();
        vm.prank(trader);
        pad.buy{value: 0.1 ether}(token, 0);

        vm.prank(trader);
        vm.expectRevert(CurveLaunchpad.NotCreator.selector);
        pad.claimFees(token);

        uint256 owed = pad.creatorFees(token);
        uint256 before = creator.balance;
        vm.prank(creator);
        pad.claimFees(token);
        assertEq(creator.balance - before, owed, "creator paid");
        assertEq(pad.creatorFees(token), 0, "cleared");
    }

    function test_withdrawProtocol_ownerOnly() public {
        address token = _launch();
        vm.prank(trader);
        pad.buy{value: 0.1 ether}(token, 0);

        vm.prank(trader);
        vm.expectRevert(CurveLaunchpad.NotOwner.selector);
        pad.withdrawProtocol(trader);

        uint256 owed = pad.protocolFees();
        pad.withdrawProtocol(address(this));
        assertEq(payable(address(this)).balance >= owed, true, "protocol fees withdrawn");
        assertEq(pad.protocolFees(), 0, "cleared");
    }

    // ---------------------------------------------------------------- invariants
    /// @dev Any sequence of partial buys and a full exit must leave the contract holding at
    ///      least the fees owed: the curve can never pay out more ETH than it took in.
    function testFuzz_solvency(uint96 a, uint96 b, uint96 c) public {
        address token = _launch();
        uint256[3] memory buys = [uint256(a) % 0.05 ether + 0.001 ether, uint256(b) % 0.05 ether + 0.001 ether, uint256(c) % 0.05 ether + 0.001 ether];

        vm.startPrank(trader);
        uint256 acquired;
        for (uint256 i = 0; i < 3; i++) {
            acquired += pad.buy{value: buys[i]}(token, 0);
        }
        IB20(token).approve(address(pad), acquired);
        pad.sell(token, acquired, 0);
        vm.stopPrank();

        assertGe(address(pad).balance, pad.protocolFees() + pad.creatorFees(token), "always solvent");
    }

    receive() external payable {}
}
