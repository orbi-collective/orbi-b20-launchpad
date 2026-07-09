import { cache } from "react";
import type { Address, Hex } from "viem";
import { createPublicClient, fallback, formatUnits, getAddress, http, isAddress, zeroAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  ACTIVATION_REGISTRY_ADDRESS,
  B20_FACTORY_ADDRESS,
  POLICY_REGISTRY_ADDRESS,
  activationRegistryAbi,
  b20Abi,
  b20AssetAbi,
  b20FactoryAbi,
  b20StablecoinAbi,
  erc20Abi,
  policyRegistryAbi
} from "@/lib/abi";
import {
  ACTIVATION_FEATURES,
  PAUSE_FEATURES,
  POLICY_SCOPES,
  describePause,
  emptyIdentity,
  formatTokenAmount,
  getVariantByte,
  makePolicyFact,
  reconcileRoleEvents,
  supplyStatus,
  unableRoles,
  variantFromByte
} from "@/lib/b20";
import { CHAINS, explorerAddressUrl, getChain } from "@/lib/chains";
import type {
  B20Config,
  B20Report,
  ChainId,
  ContractMetadata,
  NativeB20Report,
  PauseFeature,
  PolicyFact,
  RoleSummary,
  TokenIdentity
} from "@/lib/types";

type B20PublicClient = {
  // The public viem client is wrapped here to avoid leaking chain-specific transaction
  // unions into the verifier domain. The report builders below normalize all outputs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract: (parameters: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getContractEvents: (parameters: any) => Promise<any[]>;
  getBlockNumber: () => Promise<bigint>;
};

// Public Base RPCs cap eth_getLogs by block span and/or result count. We attempt the full
// range first (works for archive nodes and indexed-topic filters), then fall back to bounded
// chunked scanning that halves its window when an endpoint complains about the range.
const LOG_CHUNK_SPAN = 1_900n; // under the public Base RPC getLogs caps (2k Sepolia / 10k mainnet) to avoid span-halving retries.
const MAX_LOG_CHUNKS = 24; // budget guard: ~46k blocks per scan before we report truncation, so a report never grinds.

export class TruncatedScanError extends Error {
  readonly truncated = true;
}

export function isRangeLimitError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("range") ||
    message.includes("limit") ||
    message.includes("too large") ||
    message.includes("too many") ||
    message.includes("exceed") ||
    message.includes("more than") ||
    message.includes("10000") ||
    message.includes("block height") ||
    message.includes("logs matched")
  );
}

export async function scanLogs(
  client: B20PublicClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>,
  fromBlock: bigint,
  toBlock: bigint
): Promise<unknown[]> {
  if (toBlock < fromBlock) return [];

  try {
    return await client.getContractEvents({ ...params, fromBlock, toBlock });
  } catch (error) {
    if (!isRangeLimitError(error)) throw error;
  }

  const out: unknown[] = [];
  let span = LOG_CHUNK_SPAN;
  let start = fromBlock;
  let chunks = 0;

  while (start <= toBlock) {
    if (chunks >= MAX_LOG_CHUNKS) {
      throw new TruncatedScanError(
        `Scan stopped after ${MAX_LOG_CHUNKS} chunks; the block range is too wide for this RPC. Set BASE_*_RPC_URL to an archive endpoint for complete history.`
      );
    }
    const end = start + span - 1n > toBlock ? toBlock : start + span - 1n;
    try {
      const part = await client.getContractEvents({ ...params, fromBlock: start, toBlock: end });
      out.push(...part);
      start = end + 1n;
      chunks += 1;
    } catch (error) {
      if (isRangeLimitError(error) && span > 1_000n) {
        span = span / 2n; // endpoint wants an even smaller window — retry this chunk tighter.
        continue;
      }
      throw error;
    }
  }

  return out;
}

const SOURCE_LINKS = [
  { label: "Base B20 docs", href: "https://docs.base.org/base-chain/specs/upgrades/beryl/b20" },
  { label: "base-std repository", href: "https://github.com/base/base-std" }
];

function viemChain(chainId: ChainId) {
  return chainId === 8453 ? base : baseSepolia;
}

export const getPublicClient = cache((chainId: ChainId): B20PublicClient => {
  const chain = getChain(chainId);
  const transports = chain.rpcUrls.map((url) =>
    http(url, {
      timeout: 12_000,
      retryCount: 2,
      retryDelay: 250
    })
  );
  return createPublicClient({
    chain: viemChain(chainId),
    // Fail over across endpoints and rank them by observed latency so a single flaky
    // public RPC never sinks the whole report.
    transport: fallback(transports, { rank: true, retryCount: 0 })
  }) as unknown as B20PublicClient;
});

function shortError(error: unknown): string {
  if (error instanceof Error) return error.message.split("\n")[0] ?? error.message;
  return String(error);
}

async function safe<T>(label: string, task: Promise<T>, errors: string[]): Promise<T | null> {
  try {
    return await task;
  } catch (error) {
    errors.push(`${label}: ${shortError(error)}`);
    return null;
  }
}

async function readIdentity(client: B20PublicClient, address: Address, errors: string[]): Promise<TokenIdentity> {
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    safe("name", client.readContract({ address, abi: erc20Abi, functionName: "name" }), errors),
    safe("symbol", client.readContract({ address, abi: erc20Abi, functionName: "symbol" }), errors),
    safe("decimals", client.readContract({ address, abi: erc20Abi, functionName: "decimals" }), errors),
    safe("totalSupply", client.readContract({ address, abi: erc20Abi, functionName: "totalSupply" }), errors)
  ]);

  return {
    name,
    symbol,
    decimals,
    totalSupply: formatTokenAmount(totalSupply, decimals),
    totalSupplyRaw: totalSupply?.toString() ?? null
  };
}

async function getCreationBlock(
  client: B20PublicClient,
  address: Address,
  latestBlock: bigint,
  errors: string[]
): Promise<bigint | null> {
  // B20Created is indexed by `token`, so this is a single-address topic filter that archive
  // nodes serve cheaply across full history. Public RPCs reject the wide range; rather than grind
  // chunk-by-chunk from genesis (which is what made reports take ~30s), we take a single attempt
  // and skip role anchoring when it fails. Point BASE_*_RPC_URL at an archive RPC for full history.
  const events = (await safe(
    "B20Created event scan",
    client.getContractEvents({
      address: B20_FACTORY_ADDRESS,
      abi: b20FactoryAbi,
      eventName: "B20Created",
      args: { token: address },
      fromBlock: 0n,
      toBlock: latestBlock
    }),
    errors
  )) as Array<{ blockNumber?: bigint }> | null;
  if (!events || events.length === 0) return null;
  return events[0]?.blockNumber ?? null;
}

async function readPolicies(client: B20PublicClient, address: Address, errors: string[]): Promise<PolicyFact[]> {
  const facts = await Promise.all(
    POLICY_SCOPES.map(async ({ scope, scopeName }) => {
      const policyIdRaw = await safe(
        `${scopeName} policyId`,
        client.readContract({ address, abi: b20Abi, functionName: "policyId", args: [scope] }),
        errors
      );
      const policyId = policyIdRaw?.toString() ?? null;

      if (policyId === null) {
        return makePolicyFact({ scope, scopeName, policyId, exists: null, admin: null, pendingAdmin: null });
      }

      const policyIdBigInt = BigInt(policyId);
      const [exists, admin, pendingAdmin] = await Promise.all([
        safe(
          `${scopeName} policyExists`,
          client.readContract({
            address: POLICY_REGISTRY_ADDRESS,
            abi: policyRegistryAbi,
            functionName: "policyExists",
            args: [policyIdBigInt]
          }),
          errors
        ),
        safe(
          `${scopeName} policyAdmin`,
          client.readContract({
            address: POLICY_REGISTRY_ADDRESS,
            abi: policyRegistryAbi,
            functionName: "policyAdmin",
            args: [policyIdBigInt]
          }),
          errors
        ),
        safe(
          `${scopeName} pendingPolicyAdmin`,
          client.readContract({
            address: POLICY_REGISTRY_ADDRESS,
            abi: policyRegistryAbi,
            functionName: "pendingPolicyAdmin",
            args: [policyIdBigInt]
          }),
          errors
        )
      ]);

      return makePolicyFact({
        scope,
        scopeName,
        policyId,
        exists,
        admin: admin && admin !== zeroAddress ? getAddress(admin) : null,
        pendingAdmin: pendingAdmin && pendingAdmin !== zeroAddress ? getAddress(pendingAdmin) : null
      });
    })
  );

  return facts;
}

async function readPause(client: B20PublicClient, address: Address, errors: string[]) {
  const pausedByList = await safe(
    "pausedFeatures",
    client.readContract({ address, abi: b20Abi, functionName: "pausedFeatures" }),
    errors
  );

  let paused: PauseFeature[] = [];
  if (pausedByList) {
    paused = (pausedByList as Array<number | bigint>)
      .map((feature: number | bigint) => PAUSE_FEATURES.find((known) => known.index === Number(feature))?.label)
      .filter((feature: PauseFeature | undefined): feature is PauseFeature => Boolean(feature));
  } else {
    const checks = await Promise.all(
      PAUSE_FEATURES.map(async ({ index, label }) => {
        const value = await safe(
          `isPaused(${label})`,
          client.readContract({ address, abi: b20Abi, functionName: "isPaused", args: [index] }),
          errors
        );
        return value ? label : null;
      })
    );
    paused = checks.filter((feature): feature is PauseFeature => Boolean(feature));
  }

  return {
    paused,
    label: describePause(paused)
  };
}

async function readVariantFields(
  client: B20PublicClient,
  address: Address,
  variant: string,
  errors: string[]
): Promise<Record<string, string | null>> {
  if (variant === "stablecoin") {
    const currency = await safe(
      "currency",
      client.readContract({ address, abi: b20StablecoinAbi, functionName: "currency" }),
      errors
    );
    return { currency: currency ?? null };
  }

  if (variant === "asset") {
    const [multiplier, wadPrecision] = await Promise.all([
      safe("multiplier", client.readContract({ address, abi: b20AssetAbi, functionName: "multiplier" }), errors),
      safe("WAD_PRECISION", client.readContract({ address, abi: b20AssetAbi, functionName: "WAD_PRECISION" }), errors)
    ]);
    return {
      multiplier: multiplier?.toString() ?? null,
      multiplierFormatted: multiplier && wadPrecision ? formatUnits(multiplier, 18) : null
    };
  }

  return {};
}

function metadataUrl(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  return null;
}

async function fetchContractMetadata(uri: string | null): Promise<ContractMetadata> {
  if (!uri) return { uri, fetched: false };
  const url = metadataUrl(uri);
  if (!url) return { uri, fetched: false, error: "Unsupported metadata URI scheme" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      next: { revalidate: 300 }
    });
    if (!response.ok) return { uri, fetched: false, error: `Metadata returned HTTP ${response.status}` };
    const json: unknown = await response.json();
    if (!json || typeof json !== "object") return { uri, fetched: false, error: "Metadata is not a JSON object" };
    const record = json as Record<string, unknown>;
    return {
      uri,
      fetched: true,
      name: typeof record.name === "string" ? record.name : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
      image: typeof record.image === "string" ? record.image : undefined
    };
  } catch (error) {
    return { uri, fetched: false, error: shortError(error) };
  } finally {
    clearTimeout(timer);
  }
}

type RoleLog = { args: { role?: Hex; account?: Address }; blockNumber?: bigint; logIndex?: number };

async function readRoles(
  client: B20PublicClient,
  address: Address,
  creationBlock: bigint | null,
  latestBlock: bigint,
  errors: string[]
): Promise<RoleSummary> {
  if (creationBlock === null) {
    return unableRoles("B20Created event was not found, so role history could not be anchored.");
  }

  const [grants, revokes] = (await Promise.all([
    safe(
      "RoleGranted scan",
      scanLogs(client, { address, abi: b20Abi, eventName: "RoleGranted" }, creationBlock, latestBlock),
      errors
    ),
    safe(
      "RoleRevoked scan",
      scanLogs(client, { address, abi: b20Abi, eventName: "RoleRevoked" }, creationBlock, latestBlock),
      errors
    )
  ])) as [RoleLog[] | null, RoleLog[] | null];

  if (!grants || !revokes) {
    return unableRoles("Provider log limits or RPC errors prevented a complete role scan.", creationBlock, latestBlock);
  }

  return reconcileRoleEvents(
    [
      ...grants.map((event) => ({
        eventName: "RoleGranted" as const,
        role: event.args.role as Hex,
        account: getAddress(event.args.account as Address),
        blockNumber: event.blockNumber,
        logIndex: event.logIndex
      })),
      ...revokes.map((event) => ({
        eventName: "RoleRevoked" as const,
        role: event.args.role as Hex,
        account: getAddress(event.args.account as Address),
        blockNumber: event.blockNumber,
        logIndex: event.logIndex
      }))
    ],
    creationBlock,
    latestBlock
  );
}

async function readNativeB20Config(
  client: B20PublicClient,
  address: Address,
  identity: TokenIdentity,
  variant: "asset" | "stablecoin" | "unknown",
  errors: string[]
): Promise<Pick<NativeB20Report, "b20Config" | "policies" | "roles" | "metadata"> & { creationBlock: bigint | null }> {
  const latestBlock = await safe("latest block", client.getBlockNumber(), errors);

  const [supplyCapRaw, pause, contractURI, variantFields, policies, creationBlock] = await Promise.all([
    safe("supplyCap", client.readContract({ address, abi: b20Abi, functionName: "supplyCap" }), errors),
    readPause(client, address, errors),
    safe("contractURI", client.readContract({ address, abi: b20Abi, functionName: "contractURI" }), errors),
    readVariantFields(client, address, variant, errors),
    readPolicies(client, address, errors),
    latestBlock === null ? Promise.resolve(null) : getCreationBlock(client, address, latestBlock, errors)
  ]);

  const roles =
    latestBlock === null
      ? unableRoles("Latest block could not be read, so role history could not be scanned.", creationBlock)
      : await readRoles(client, address, creationBlock, latestBlock, errors);
  const metadata = await fetchContractMetadata(contractURI);
  const b20Config: B20Config = {
    variant,
    supply: supplyStatus(
      identity.totalSupplyRaw !== null ? BigInt(identity.totalSupplyRaw) : null,
      supplyCapRaw,
      identity.decimals
    ),
    pause,
    contractURI,
    variantFields
  };

  return { b20Config, policies, roles, metadata, creationBlock };
}

export const buildReport = cache(async (chainId: ChainId, inputAddress: string): Promise<B20Report> => {
  const checkedAt = new Date().toISOString();
  const chain = CHAINS[chainId];
  const errors: string[] = [];

  if (!isAddress(inputAddress)) {
    const fallbackAddress = "0x0000000000000000000000000000000000000000" as Address;
    return {
      status: "unavailable",
      label: "Verification Unavailable",
      chainId,
      chainName: chain.name,
      address: fallbackAddress,
      checkedAt,
      explorerUrl: explorerAddressUrl(chainId, fallbackAddress),
      identity: emptyIdentity(),
      factory: {
        factoryAddress: B20_FACTORY_ADDRESS,
        isB20: null,
        isB20Initialized: null,
        variantByte: null,
        variant: "unknown",
        creationBlock: null
      },
      b20Config: null,
      policies: [],
      roles: null,
      metadata: null,
      sources: SOURCE_LINKS,
      errors: [`Invalid EVM address: ${inputAddress}`]
    };
  }

  const address = getAddress(inputAddress);
  const client = getPublicClient(chainId);
  const variantByte = getVariantByte(address);
  const variant = variantFromByte(variantByte);

  const [isB20, isB20Initialized, identity] = await Promise.all([
    safe(
      "B20Factory.isB20",
      client.readContract({ address: B20_FACTORY_ADDRESS, abi: b20FactoryAbi, functionName: "isB20", args: [address] }),
      errors
    ),
    safe(
      "B20Factory.isB20Initialized",
      client.readContract({
        address: B20_FACTORY_ADDRESS,
        abi: b20FactoryAbi,
        functionName: "isB20Initialized",
        args: [address]
      }),
      errors
    ),
    readIdentity(client, address, errors)
  ]);

  const baseReport = {
    chainId,
    chainName: chain.name,
    address,
    checkedAt,
    explorerUrl: explorerAddressUrl(chainId, address),
    identity,
    factory: {
      factoryAddress: B20_FACTORY_ADDRESS,
      isB20,
      isB20Initialized,
      variantByte,
      variant,
      creationBlock: null as string | null
    },
    sources: SOURCE_LINKS,
    errors
  };

  if (isB20 === null || isB20Initialized === null) {
    return {
      ...baseReport,
      status: "unavailable",
      label: "Verification Unavailable",
      b20Config: null,
      policies: [],
      roles: null,
      metadata: null
    };
  }

  if (!isB20 || !isB20Initialized) {
    return {
      ...baseReport,
      status: "not-native",
      label: "Not Native B20",
      b20Config: null,
      policies: [],
      roles: null,
      metadata: null
    };
  }

  const nativeConfig = await readNativeB20Config(client, address, identity, variant, errors);

  return {
    ...baseReport,
    status: "native",
    label: "Native B20",
    factory: {
      ...baseReport.factory,
      creationBlock: nativeConfig.creationBlock?.toString() ?? null
    },
    b20Config: nativeConfig.b20Config,
    policies: nativeConfig.policies,
    roles: nativeConfig.roles,
    metadata: nativeConfig.metadata
  };
});

export async function readActivationStatus(chainId: ChainId) {
  const client = getPublicClient(chainId);
  const errors: string[] = [];
  const startedAt = Date.now();

  // Two independent probes:
  //  - getBlockNumber proves the Base RPC is reachable and the chain is producing blocks.
  //  - isB20() on the factory precompile proves the B20 protocol is actually deployed on this
  //    network. The call never reverts when the precompile exists, so a non-null answer (even
  //    `false` for the zero address) means the precompile is live; a null means no code / not live.
  const [blockNumber, factoryProbe, admin, assetActive, stablecoinActive] = await Promise.all([
    safe("blockNumber", client.getBlockNumber(), errors),
    safe(
      "B20 factory precompile probe",
      client.readContract({ address: B20_FACTORY_ADDRESS, abi: b20FactoryAbi, functionName: "isB20", args: [zeroAddress] }),
      errors
    ),
    safe("activation admin", client.readContract({ address: ACTIVATION_REGISTRY_ADDRESS, abi: activationRegistryAbi, functionName: "admin" }), errors),
    safe(
      "B20 asset activation",
      client.readContract({
        address: ACTIVATION_REGISTRY_ADDRESS,
        abi: activationRegistryAbi,
        functionName: "isActivated",
        args: [ACTIVATION_FEATURES.B20_ASSET]
      }),
      errors
    ),
    safe(
      "B20 stablecoin activation",
      client.readContract({
        address: ACTIVATION_REGISTRY_ADDRESS,
        abi: activationRegistryAbi,
        functionName: "isActivated",
        args: [ACTIVATION_FEATURES.B20_STABLECOIN]
      }),
      errors
    )
  ]);

  const chainLive = blockNumber !== null;
  const factoryLive = factoryProbe !== null;
  const activationReadable = assetActive !== null || stablecoinActive !== null;
  // The protocol is "live" once the factory precompile answers. Variant activation flags refine
  // *which* variants are enabled, but the factory responding is the deployment signal.
  const b20Live = factoryLive;

  return {
    chainId,
    chainName: getChain(chainId).name,
    rpcUrl: getChain(chainId).rpcUrl,
    latencyMs: Date.now() - startedAt,
    blockNumber: blockNumber?.toString() ?? null,
    chainLive,
    b20Live,
    factoryLive,
    activationReadable,
    activationRegistry: ACTIVATION_REGISTRY_ADDRESS,
    policyRegistry: POLICY_REGISTRY_ADDRESS,
    factory: B20_FACTORY_ADDRESS,
    admin,
    features: [
      { name: "B20_ASSET", feature: ACTIVATION_FEATURES.B20_ASSET, active: assetActive },
      { name: "B20_STABLECOIN", feature: ACTIVATION_FEATURES.B20_STABLECOIN, active: stablecoinActive }
    ],
    errors
  };
}
