"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { useWallet, shortenAddress } from "@/lib/wallet";
import { TokenAvatar } from "@/components/token-avatar";
import { CHAINS, MAINNET_LIVE, tokenRoute } from "@/lib/chains";
import type { ChainId } from "@/lib/types";
import {
  b20FactoryWriteAbi,
  buildCreateTx,
  mapLaunchError,
  randomSalt,
  tokenDecimals,
  validateConfig,
  type LaunchConfig
} from "@/lib/b20-factory";
import { B20_FACTORY_ADDRESS } from "@/lib/abi";

const STEPS = ["Variant", "Identity", "Supply", "Policies", "Advanced", "Review"] as const;
type StepIndex = number;

// Fields each step is responsible for, so we can gate "Next" without validating the whole form.
const STEP_FIELDS: Record<number, (keyof ReturnType<typeof validateConfig>)[]> = {
  0: [],
  1: ["name", "symbol", "decimals", "currency", "initialAdmin"],
  2: ["initialMint", "supplyCap"],
  3: [],
  4: ["multiplier"],
  5: []
};

function viemChain(chainId: ChainId) {
  return chainId === 8453 ? base : baseSepolia;
}

function readClient(chainId: ChainId) {
  return createPublicClient({ chain: viemChain(chainId), transport: http(CHAINS[chainId].rpcUrl) });
}

type TxPhase = "idle" | "preparing" | "awaiting" | "pending" | "success" | "error";

function defaultConfig(admin: Address | null): LaunchConfig {
  return {
    variant: "asset",
    name: "",
    symbol: "",
    decimals: 18,
    currency: "",
    initialAdmin: admin,
    initialMint: admin ? { to: admin, amount: "" } : null,
    supplyCap: null,
    grantMintRole: true,
    multiplier: null,
    transferPolicy: "open"
  };
}

export function LaunchFlow() {
  const { status, address, chainId, connect, switchChain, getWalletClient } = useWallet();
  const [network, setNetwork] = useState<ChainId>(MAINNET_LIVE ? 8453 : 84532);
  const [step, setStep] = useState<StepIndex>(0);
  const [config, setConfig] = useState<LaunchConfig>(() => defaultConfig(null));
  const [salt, setSalt] = useState<Hex>(() => randomSalt());
  const [predicted, setPredicted] = useState<Address | null>(null);
  const [tx, setTx] = useState<TxPhase>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  // When the wallet connects, seed admin + mint recipient with the connected account. Done as a
  // render-time adjustment (React's "storing information from previous renders" pattern) rather
  // than an effect, so the seeded values land in the same render pass instead of a cascading one.
  const [seededFor, setSeededFor] = useState<Address | null>(null);
  if (address && seededFor !== address) {
    setSeededFor(address);
    setConfig((c) => ({
      ...c,
      initialAdmin: c.initialAdmin ?? address,
      initialMint: c.initialMint ?? { to: address, amount: "" }
    }));
  }

  const errors = useMemo(() => validateConfig(config), [config]);
  const stepValid = (s: number) => STEP_FIELDS[s].every((f) => !errors[f]);
  const allValid = Object.keys(errors).length === 0;

  // Deterministic address preview: depends only on (variant, deployer, salt). While the wallet
  // is disconnected we derive null at render time instead of resetting state inside the effect.
  const shownPredicted = address ? predicted : null;
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const built = buildCreateTx(config, salt);
    readClient(network)
      .readContract({
        address: B20_FACTORY_ADDRESS,
        abi: b20FactoryWriteAbi,
        functionName: "getB20Address",
        args: [built.variant, address, salt]
      })
      .then((addr) => {
        if (!cancelled) setPredicted(addr as Address);
      })
      .catch(() => {
        if (!cancelled) setPredicted(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, network, salt, config.variant]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback(<K extends keyof LaunchConfig>(key: K, value: LaunchConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
  }, []);

  const mainnetLive = MAINNET_LIVE;
  const wrongNetwork = status === "connected" && chainId !== network;
  const networkBlocked = network === 8453 && !mainnetLive;

  async function deploy() {
    setTxError(null);
    if (status !== "connected" || !address) {
      await connect();
      return;
    }
    if (networkBlocked) return;
    setTx("preparing");
    try {
      if (chainId !== network) await switchChain(network);
      const wallet = getWalletClient(network);
      if (!wallet) throw new Error("Wallet client unavailable.");
      const pub = readClient(network);
      const built = buildCreateTx(config, salt);

      const { request } = await pub.simulateContract({
        account: address,
        address: B20_FACTORY_ADDRESS,
        abi: b20FactoryWriteAbi,
        functionName: "createB20",
        args: [built.variant, built.salt, built.params, built.initCalls]
      });

      setTx("awaiting");
      const hash = await wallet.writeContract(request);
      setTxHash(hash);
      setTx("pending");
      await pub.waitForTransactionReceipt({ hash, confirmations: 1 });
      setTx("success");
    } catch (err) {
      setTxError(mapLaunchError(err));
      setTx("error");
    }
  }

  function resetForAnother() {
    setConfig(defaultConfig(address));
    setSalt(randomSalt());
    setStep(0);
    setTx("idle");
    setTxError(null);
    setTxHash(null);
  }

  if (tx === "success" && predicted) {
    return <LaunchSuccess address={predicted} network={network} hash={txHash} onAnother={resetForAnother} />;
  }

  return (
    <div className="launch-grid">
      <div className="launch-main">
        <StepRail step={step} setStep={setStep} stepValid={stepValid} />

        {step === 0 ? <VariantStep config={config} set={set} /> : null}
        {step === 1 ? <IdentityStep config={config} set={set} errors={errors} /> : null}
        {step === 2 ? <SupplyStep config={config} set={set} errors={errors} /> : null}
        {step === 3 ? <PoliciesStep config={config} set={set} /> : null}
        {step === 4 ? <AdvancedStep config={config} set={set} errors={errors} salt={salt} regenSalt={() => setSalt(randomSalt())} /> : null}
        {step === 5 ? (
          <ReviewStep
            config={config}
            network={network}
            setNetwork={setNetwork}
            predicted={shownPredicted}
            status={status}
            wrongNetwork={wrongNetwork}
            networkBlocked={networkBlocked}
            tx={tx}
            txError={txError}
            onConnect={connect}
            onDeploy={deploy}
          />
        ) : null}

        <div className="launch-nav">
          <button type="button" className="ghost-btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="primary-btn" onClick={() => setStep((s) => s + 1)} disabled={!stepValid(step)}>
              Continue
            </button>
          ) : null}
        </div>
      </div>

      <LivePreview config={config} network={network} predicted={shownPredicted} allValid={allValid} />
    </div>
  );
}

function StepRail({ step, setStep, stepValid }: { step: number; setStep: (n: number) => void; stepValid: (s: number) => boolean }) {
  return (
    <ol className="step-rail" aria-label="Launch steps">
      {STEPS.map((label, i) => {
        const state = i === step ? "current" : i < step ? "done" : "todo";
        const reachable = i <= step || stepValid(step);
        return (
          <li key={label} className={`step-rail-item is-${state}`}>
            <button type="button" onClick={() => reachable && setStep(i)} disabled={!reachable} aria-current={i === step ? "step" : undefined}>
              <span className="step-rail-num">{i + 1}</span>
              <span className="step-rail-label">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

type StepProps = {
  config: LaunchConfig;
  set: <K extends keyof LaunchConfig>(key: K, value: LaunchConfig[K]) => void;
  errors?: ReturnType<typeof validateConfig>;
};

function VariantStep({ config, set }: StepProps) {
  return (
    <section className="launch-step">
      <h2>Choose a variant</h2>
      <p className="launch-step-lead">Both are native B20 tokens. The variant is sealed at creation and sets the address prefix.</p>
      <div className="variant-choice">
        <button
          type="button"
          className={`variant-card ${config.variant === "asset" ? "is-selected" : ""}`}
          onClick={() => set("variant", "asset")}
          aria-pressed={config.variant === "asset"}
        >
          <span className="variant-card-name">Asset</span>
          <p>Configurable decimals (6 to 18), rebase multiplier, onchain announcements, batched issuance. For RWAs, equity, and long-tail tokens.</p>
        </button>
        <button
          type="button"
          className={`variant-card ${config.variant === "stablecoin" ? "is-selected" : ""}`}
          onClick={() => set("variant", "stablecoin")}
          aria-pressed={config.variant === "stablecoin"}
        >
          <span className="variant-card-name">Stablecoin</span>
          <p>Fixed 6 decimals and an immutable, self-declared currency code. For fiat-referenced stablecoins.</p>
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="launch-field">
      <span className="launch-field-label">{label}</span>
      {children}
      {error ? <span className="launch-field-error">{error}</span> : hint ? <span className="launch-field-hint">{hint}</span> : null}
    </label>
  );
}

function IdentityStep({ config, set, errors = {} }: StepProps) {
  return (
    <section className="launch-step">
      <h2>Token identity</h2>
      <p className="launch-step-lead">These are written onchain at creation. Name and symbol can be updated later by an admin.</p>
      <div className="launch-field-grid">
        <Field label="Name" error={errors.name}>
          <input value={config.name} maxLength={64} onChange={(e) => set("name", e.target.value)} placeholder="Acme Dollar" />
        </Field>
        <Field label="Symbol" error={errors.symbol}>
          <input value={config.symbol} maxLength={16} onChange={(e) => set("symbol", e.target.value.toUpperCase())} placeholder="ACME" className="mono-input" />
        </Field>
        {config.variant === "asset" ? (
          <Field label="Decimals" hint="6 to 18" error={errors.decimals}>
            <input
              type="number"
              min={6}
              max={18}
              value={config.decimals ?? ""}
              onChange={(e) => set("decimals", e.target.value === "" ? null : Number(e.target.value))}
              className="mono-input"
            />
          </Field>
        ) : (
          <Field label="Currency code" hint="Uppercase letters, e.g. USD" error={errors.currency}>
            <input
              value={config.currency ?? ""}
              maxLength={8}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
              placeholder="USD"
              className="mono-input"
            />
          </Field>
        )}
        <Field label="Initial admin" hint="Holds DEFAULT_ADMIN_ROLE. Leave blank to deploy admin-less." error={errors.initialAdmin}>
          <input
            value={config.initialAdmin ?? ""}
            onChange={(e) => set("initialAdmin", e.target.value ? (e.target.value as Address) : null)}
            placeholder="0x… (your wallet)"
            className="mono-input"
          />
        </Field>
      </div>
    </section>
  );
}

function SupplyStep({ config, set, errors = {} }: StepProps) {
  const mint = config.initialMint;
  return (
    <section className="launch-step">
      <h2>Supply &amp; initial mint</h2>
      <p className="launch-step-lead">
        Minting happens inside the creation transaction, so no separate mint call is needed. The supply cap bounds total supply; leave it
        blank for an unbounded cap.
      </p>
      <div className="launch-field-grid">
        <Field label="Initial mint amount" hint="Whole tokens minted at launch" error={errors.initialMint}>
          <input
            value={mint?.amount ?? ""}
            onChange={(e) => set("initialMint", { to: mint?.to ?? config.initialAdmin ?? ("" as Address), amount: e.target.value })}
            placeholder="1000000"
            className="mono-input"
            inputMode="decimal"
          />
        </Field>
        <Field label="Mint recipient" hint="Defaults to the admin">
          <input
            value={mint?.to ?? ""}
            onChange={(e) => set("initialMint", { to: e.target.value as Address, amount: mint?.amount ?? "" })}
            placeholder="0x…"
            className="mono-input"
          />
        </Field>
        <Field label="Supply cap" hint="Blank = unbounded" error={errors.supplyCap}>
          <input
            value={config.supplyCap ?? ""}
            onChange={(e) => set("supplyCap", e.target.value || null)}
            placeholder="Unbounded"
            className="mono-input"
            inputMode="decimal"
          />
        </Field>
        <label className="launch-toggle">
          <input type="checkbox" checked={config.grantMintRole} onChange={(e) => set("grantMintRole", e.target.checked)} />
          <span>Grant the admin MINT_ROLE so they can mint more after launch</span>
        </label>
      </div>
    </section>
  );
}

function PoliciesStep({ config, set }: StepProps) {
  return (
    <section className="launch-step">
      <h2>Transfer policy</h2>
      <p className="launch-step-lead">
        Sets the sender-side transfer policy at creation using the protocol&apos;s built-in rules. Custom allow / block lists can be added
        after launch from the token&apos;s policy admin.
      </p>
      <div className="policy-choice">
        {(
          [
            { id: "open", title: "Open transfers", body: "Anyone can send and receive. The default for most tokens." },
            { id: "restricted", title: "Transfers restricted", body: "Sender-side transfers are blocked until you configure a policy after launch." }
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            className={`policy-option ${config.transferPolicy === p.id ? "is-selected" : ""}`}
            onClick={() => set("transferPolicy", p.id)}
            aria-pressed={config.transferPolicy === p.id}
          >
            <span className="policy-option-title">{p.title}</span>
            <p>{p.body}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function AdvancedStep({
  config,
  set,
  errors = {},
  salt,
  regenSalt
}: StepProps & { salt: Hex; regenSalt: () => void }) {
  return (
    <section className="launch-step">
      <h2>Advanced</h2>
      <p className="launch-step-lead">Optional. Sensible defaults are fine to leave as-is.</p>
      <div className="launch-field-grid">
        {config.variant === "asset" ? (
          <Field label="Rebase multiplier" hint="Whole number, default 1. Scales balances for rebasing assets." error={errors.multiplier}>
            <input
              value={config.multiplier ?? ""}
              onChange={(e) => set("multiplier", e.target.value || null)}
              placeholder="1"
              className="mono-input"
              inputMode="decimal"
            />
          </Field>
        ) : null}
        <Field label="Salt" hint="Determines the token address. Regenerate if the address is taken.">
          <div className="salt-row">
            <input value={salt} readOnly className="mono-input salt-input" />
            <button type="button" className="ghost-btn" onClick={regenSalt}>
              Regenerate
            </button>
          </div>
        </Field>
      </div>
    </section>
  );
}

function ReviewStep({
  config,
  network,
  setNetwork,
  predicted,
  status,
  wrongNetwork,
  networkBlocked,
  tx,
  txError,
  onConnect,
  onDeploy
}: {
  config: LaunchConfig;
  network: ChainId;
  setNetwork: (c: ChainId) => void;
  predicted: Address | null;
  status: string;
  wrongNetwork: boolean;
  networkBlocked: boolean;
  tx: TxPhase;
  txError: string | null;
  onConnect: () => void;
  onDeploy: () => void;
}) {
  const decimals = tokenDecimals(config);
  const busy = tx === "preparing" || tx === "awaiting" || tx === "pending";
  const cta =
    status !== "connected"
      ? "Connect wallet to deploy"
      : tx === "preparing"
        ? "Preparing…"
        : tx === "awaiting"
          ? "Confirm in wallet…"
          : tx === "pending"
            ? "Deploying…"
            : "Deploy token";

  return (
    <section className="launch-step">
      <h2>Review &amp; deploy</h2>

      <div className="network-switch" role="radiogroup" aria-label="Network">
        {(
          [
            { id: 8453 as ChainId, label: "Base Mainnet" },
            { id: 84532 as ChainId, label: "Base Sepolia" }
          ]
        ).map((n) => (
          <button
            key={n.id}
            type="button"
            role="radio"
            aria-checked={network === n.id}
            className={`network-pill ${network === n.id ? "is-active" : ""}`}
            onClick={() => setNetwork(n.id)}
          >
            {n.label}
          </button>
        ))}
      </div>

      <dl className="review-list">
        <div>
          <dt>Variant</dt>
          <dd className="cap">{config.variant}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{config.name || "—"}</dd>
        </div>
        <div>
          <dt>Symbol</dt>
          <dd className="mono">{config.symbol || "—"}</dd>
        </div>
        <div>
          <dt>{config.variant === "stablecoin" ? "Currency" : "Decimals"}</dt>
          <dd className="mono">{config.variant === "stablecoin" ? config.currency || "—" : decimals}</dd>
        </div>
        <div>
          <dt>Initial mint</dt>
          <dd className="mono">{config.initialMint?.amount ? `${config.initialMint.amount} ${config.symbol || ""}` : "None"}</dd>
        </div>
        <div>
          <dt>Supply cap</dt>
          <dd className="mono">{config.supplyCap || "Unbounded"}</dd>
        </div>
        <div>
          <dt>Transfers</dt>
          <dd className="cap">{config.transferPolicy === "restricted" ? "Restricted" : "Open"}</dd>
        </div>
        <div>
          <dt>Predicted address</dt>
          <dd className="mono predicted">{predicted ? predicted : status === "connected" ? "Computing…" : "Connect wallet"}</dd>
        </div>
      </dl>

      {networkBlocked ? (
        <p className="launch-banner warn">
          Mainnet B20 creation opens at launch. Deploy on Base Sepolia today, the same flow runs on mainnet the moment it goes live.
        </p>
      ) : wrongNetwork ? (
        <p className="launch-banner">Your wallet is on a different network. Deploying will switch it to {CHAINS[network].name}.</p>
      ) : null}

      {txError ? <p className="launch-banner error">{txError}</p> : null}

      <button
        type="button"
        className="deploy-btn"
        onClick={status !== "connected" ? onConnect : onDeploy}
        disabled={busy || networkBlocked || (status === "connected" && Object.keys(validateConfig(config)).length > 0)}
      >
        {cta}
      </button>
      <p className="deploy-note">Deploys a real onchain token on {CHAINS[network].name}. You sign one transaction.</p>
    </section>
  );
}

function LivePreview({
  config,
  network,
  predicted,
  allValid
}: {
  config: LaunchConfig;
  network: ChainId;
  predicted: Address | null;
  allValid: boolean;
}) {
  const decimals = tokenDecimals(config);
  return (
    <aside className="launch-preview" aria-label="Token preview">
      <span className="launch-preview-eyebrow">Preview</span>
      <div className="preview-token">
        <TokenAvatar symbol={config.symbol} size={60} />
        <span className={`preview-variant ${config.variant}`}>{config.variant}</span>
        <h3>{config.name || "Your token"}</h3>
        <p className="preview-symbol mono">{config.symbol || "SYMBOL"}</p>
      </div>
      <dl className="preview-facts">
        <div>
          <dt>Network</dt>
          <dd>{CHAINS[network].shortName}</dd>
        </div>
        <div>
          <dt>{config.variant === "stablecoin" ? "Currency" : "Decimals"}</dt>
          <dd className="mono">{config.variant === "stablecoin" ? config.currency || "—" : decimals}</dd>
        </div>
        <div>
          <dt>Initial supply</dt>
          <dd className="mono">{config.initialMint?.amount || "0"}</dd>
        </div>
        <div>
          <dt>Cap</dt>
          <dd className="mono">{config.supplyCap || "Unbounded"}</dd>
        </div>
      </dl>
      <div className="preview-address">
        <span>Address</span>
        <code>{predicted ? `${predicted.slice(0, 14)}…${predicted.slice(-8)}` : "Connect wallet"}</code>
      </div>
      <p className={`preview-ready ${allValid ? "ok" : ""}`}>{allValid ? "Ready to deploy" : "Fill in the required fields"}</p>
    </aside>
  );
}

function LaunchSuccess({
  address,
  network,
  hash,
  onAnother
}: {
  address: Address;
  network: ChainId;
  hash: Hex | null;
  onAnother: () => void;
}) {
  const reportHref = tokenRoute(network, address);
  const explorer = `${CHAINS[network].explorerBaseUrl}/address/${address}`;
  return (
    <div className="launch-success">
      <span className="launch-success-orb" aria-hidden="true" />
      <h2>Token deployed</h2>
      <p className="launch-success-sub">Your native B20 is live on {CHAINS[network].name}.</p>
      <code className="launch-success-addr">{address}</code>
      <div className="launch-success-actions">
        <Link className="primary-btn" href={reportHref}>
          View its proof report
        </Link>
        <a className="ghost-btn" href={explorer} target="_blank" rel="noreferrer">
          Open in explorer
        </a>
        <button type="button" className="ghost-btn" onClick={onAnother}>
          Launch another
        </button>
      </div>
      {hash ? <p className="launch-success-tx mono">tx {shortenAddress(hash)}</p> : null}
    </div>
  );
}
