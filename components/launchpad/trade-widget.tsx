"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPublicClient, formatEther, formatUnits, http, parseAbi, parseEther, parseUnits } from "viem";
import { base, baseSepolia } from "viem/chains";
import { useWallet } from "@/lib/wallet";
import { CHAINS } from "@/lib/chains";
import { curveAddress, curveLaunchpadAbi, quoteBuy, quoteSell, type CurveParams, type CurveToken } from "@/lib/curve";
import type { ChainId } from "@/lib/types";

const QUICK_ETH = [0.01, 0.05, 0.1, 0.5];
const QUICK_PCT = [25, 50, 75, 100];
const SLIPPAGE_OPTIONS = [0.5, 1, 3];

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)"
]);

function readClient(chainId: ChainId) {
  return createPublicClient({ chain: chainId === 8453 ? base : baseSepolia, transport: http(CHAINS[chainId].rpcUrl) });
}

function mapTradeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied/i.test(msg)) return "Transaction rejected in the wallet.";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH in the wallet for this trade plus gas.";
  if (/Slippage/i.test(msg)) return "Price moved beyond your slippage tolerance. Retry or raise slippage.";
  if (/AlreadyGraduated/i.test(msg)) return "This curve just graduated: trade it on the DEX instead.";
  if (/CurveFull/i.test(msg)) return "The curve just filled. Buying is closed; it can be graduated to the DEX now.";
  return msg.split("\n")[0].slice(0, 160);
}

type TxPhase = "idle" | "preparing" | "awaiting" | "pending" | "success" | "error";

export function TradeWidget({ token, params }: { token: CurveToken; params: CurveParams }) {
  const router = useRouter();
  const { status, address, chainId: walletChain, connect, switchChain, getWalletClient } = useWallet();
  // Curve full: buys are closed onchain (they revert CurveFull), only selling remains.
  const buyClosed = token.readyToGraduate;
  const [side, setSide] = useState<"buy" | "sell">(buyClosed ? "sell" : "buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(1);
  const [tx, setTx] = useState<TxPhase>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);

  const graduated = token.status === "graduated";
  const pad = curveAddress(token.chainId);
  const tradable = pad !== null && token.reserves !== null && !graduated;

  // Live sell-side balance for the % quick buttons.
  useEffect(() => {
    if (!tradable || !address) return;
    let cancelled = false;
    readClient(token.chainId)
      .readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address] })
      .then((v) => {
        if (!cancelled) setBalance(v as bigint);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tradable, address, token.address, token.chainId, tx]);

  const estimate = useMemo(() => {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0 || !tradable || !token.reserves) return null;

    const reserves = { realEth: BigInt(token.reserves.realEth), tokenReserve: BigInt(token.reserves.tokenReserve) };
    const p = { virtualEth: BigInt(params.virtualEth), feeBps: BigInt(params.feeBps) };
    if (side === "buy") {
      const q = quoteBuy(parseEther(amount as `${number}`), reserves, p);
      return { outText: `${fmtTokens(Number(formatUnits(q.amountOut, 18)))} ${token.symbol}`, priceImpactPct: q.priceImpactPct, raw: q.amountOut };
    }
    const q = quoteSell(parseUnits(amount as `${number}`, 18), reserves, p);
    return { outText: `${Number(formatEther(q.amountOut)).toFixed(5)} ETH`, priceImpactPct: q.priceImpactPct, raw: q.amountOut };
  }, [amount, side, token, tradable, params]);

  const highImpact = Math.abs(estimate?.priceImpactPct ?? 0) > 8;

  function setQuickEth(v: number) {
    setSide("buy");
    setAmount(String(v));
  }

  function setQuickPct(pct: number) {
    if (balance === null) return;
    const tokens = Number(formatUnits((balance * BigInt(pct)) / 100n, 18));
    setAmount(tokens > 0 ? String(Math.floor(tokens * 1e6) / 1e6) : "0");
  }

  async function trade() {
    if (!tradable || !pad || !token.reserves || !estimate?.raw) return;
    setTxError(null);
    if (status !== "connected" || !address) {
      await connect();
      return;
    }
    setTx("preparing");
    try {
      if (walletChain !== token.chainId) await switchChain(token.chainId);
      const wallet = getWalletClient(token.chainId);
      if (!wallet) throw new Error("Wallet client unavailable.");
      const pub = readClient(token.chainId);
      const slippageBps = BigInt(Math.round(slippage * 100));
      const minOut = (estimate.raw * (10_000n - slippageBps)) / 10_000n;

      if (side === "buy") {
        const value = parseEther(amount as `${number}`);
        const { request } = await pub.simulateContract({
          account: address,
          address: pad,
          abi: curveLaunchpadAbi,
          functionName: "buy",
          args: [token.address, minOut],
          value
        });
        setTx("awaiting");
        const hash = await wallet.writeContract(request);
        setTx("pending");
        await pub.waitForTransactionReceipt({ hash, confirmations: 1 });
      } else {
        const tokensIn = parseUnits(amount as `${number}`, 18);
        const allowance = (await pub.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, pad]
        })) as bigint;
        if (allowance < tokensIn) {
          const { request: approveReq } = await pub.simulateContract({
            account: address,
            address: token.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [pad, tokensIn]
          });
          setTx("awaiting");
          const approveHash = await wallet.writeContract(approveReq);
          setTx("pending");
          await pub.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 });
        }
        const { request } = await pub.simulateContract({
          account: address,
          address: pad,
          abi: curveLaunchpadAbi,
          functionName: "sell",
          args: [token.address, tokensIn, minOut]
        });
        setTx("awaiting");
        const hash = await wallet.writeContract(request);
        setTx("pending");
        await pub.waitForTransactionReceipt({ hash, confirmations: 1 });
      }

      setTx("success");
      setAmount("");
      router.refresh(); // re-read reserves/price/feed from chain
    } catch (err) {
      setTxError(mapTradeError(err));
      setTx("error");
    }
  }

  const busy = tx === "preparing" || tx === "awaiting" || tx === "pending";
  const cta = !tradable
    ? "Trading not live yet"
    : status !== "connected"
      ? "Connect wallet to trade"
      : tx === "preparing"
        ? "Preparing…"
        : tx === "awaiting"
          ? "Confirm in wallet…"
          : tx === "pending"
            ? "Settling…"
            : side === "buy"
              ? `Buy ${token.symbol}`
              : `Sell ${token.symbol}`;

  return (
    <div className="trade-widget">
      <div className="trade-tabs" role="tablist" aria-label="Trade side">
        <button
          type="button"
          role="tab"
          aria-selected={side === "buy"}
          className={`trade-tab buy ${side === "buy" ? "is-active" : ""}`}
          onClick={() => setSide("buy")}
          disabled={graduated || buyClosed}
          title={buyClosed ? "Curve is full: buying is closed until graduation" : undefined}
        >
          Buy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={side === "sell"}
          className={`trade-tab sell ${side === "sell" ? "is-active" : ""}`}
          onClick={() => setSide("sell")}
          disabled={graduated}
        >
          Sell
        </button>
      </div>

      {graduated ? (
        <p className="launch-banner">{token.symbol} graduated: its liquidity now lives in a Base DEX pool. Trade it there.</p>
      ) : (
        <>
          <label className="trade-amount-field">
            <span className="trade-amount-label">
              {side === "buy" ? "You pay" : "You sell"}
              <span className="mono">{side === "buy" ? "ETH" : token.symbol}</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mono"
            />
          </label>

          <div className="trade-quick-row">
            {(side === "buy" ? QUICK_ETH : QUICK_PCT).map((v) => (
              <button
                key={v}
                type="button"
                className="trade-quick-btn"
                onClick={() => (side === "buy" ? setQuickEth(v as number) : setQuickPct(v as number))}
              >
                {side === "buy" ? `${v} ETH` : `${v}%`}
              </button>
            ))}
          </div>

          <div className="trade-estimate">
            <div className="trade-estimate-row">
              <span>You receive</span>
              <span className="mono">{estimate ? `~${estimate.outText}` : "—"}</span>
            </div>
            <div className="trade-estimate-row">
              <span>Price impact</span>
              <span className={`mono ${highImpact ? "trade-impact-high" : ""}`}>
                {estimate ? `${estimate.priceImpactPct.toFixed(2)}%` : "—"}
              </span>
            </div>
            {tradable && side === "sell" && balance !== null ? (
              <div className="trade-estimate-row">
                <span>Your balance</span>
                <span className="mono">
                  {fmtTokens(Number(formatUnits(balance, 18)))} {token.symbol}
                </span>
              </div>
            ) : null}
          </div>

          <div className="trade-slippage">
            <span>Slippage</span>
            <div className="trade-slippage-options">
              {SLIPPAGE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`trade-slippage-btn ${slippage === s ? "is-active" : ""}`}
                  onClick={() => setSlippage(s)}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>

          {highImpact ? <p className="launch-banner warn">High price impact for this size. Consider a smaller amount.</p> : null}

          {tx === "success" ? <p className="launch-banner ok">Trade settled onchain.</p> : null}
          {txError ? <p className="launch-banner error">{txError}</p> : null}

          <button
            type="button"
            className="deploy-btn"
            onClick={!tradable ? undefined : status !== "connected" ? connect : trade}
            disabled={!tradable || busy || (status === "connected" && !estimate)}
          >
            {cta}
          </button>
        </>
      )}
    </div>
  );
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 0.01) return n.toFixed(6);
  if (n < 1000) return n.toFixed(2);
  return Math.round(n).toLocaleString();
}
