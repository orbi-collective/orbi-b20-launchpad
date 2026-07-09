import type { Address, Hex } from "viem";

export type ChainId = 8453 | 84532;

export type ReportStatus = "native" | "not-native" | "unavailable";

export type B20Variant = "asset" | "stablecoin" | "unknown";

export type VerificationLabel = "Native B20" | "Not Native B20" | "Verification Unavailable";

export type PolicyKind = "always-allow" | "always-reject" | "custom" | "unknown";

// Mirrors IB20.PausableFeature in base-std (append-only enum): TRANSFER=0, MINT=1, BURN=2.
// There is no REDEEM feature — isPaused(3) reverts on the precompile.
export type PauseFeature = "TRANSFER" | "MINT" | "BURN";

export type SourceLink = {
  label: string;
  href: string;
};

export type TokenIdentity = {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  totalSupplyRaw: string | null;
};

export type FactoryEvidence = {
  factoryAddress: Address;
  isB20: boolean | null;
  isB20Initialized: boolean | null;
  variantByte: number | null;
  variant: B20Variant;
  creationBlock: string | null;
};

export type SupplyStatus = {
  capRaw: string | null;
  cap: string | null;
  label: "Fixed supply" | "Supply can change" | "Unbounded supply cap" | "Unable to determine";
  utilizationPct: number | null;
};

export type PolicyFact = {
  scope: Hex;
  scopeName: string;
  policyId: string | null;
  kind: PolicyKind;
  label: string;
  exists: boolean | null;
  admin: Address | null;
  pendingAdmin: Address | null;
};

export type PauseState = {
  paused: PauseFeature[];
  label: string;
};

export type B20Config = {
  variant: B20Variant;
  supply: SupplyStatus;
  pause: PauseState;
  contractURI: string | null;
  variantFields: Record<string, string | null>;
};

export type RoleHolder = {
  role: Hex;
  roleName: string;
  accounts: Address[];
};

export type RoleSummary = {
  status: "observed" | "unable";
  label: "No observed admin" | "Admin role observed" | "Unable to determine";
  fromBlock: string | null;
  toBlock: string | null;
  holders: RoleHolder[];
  note: string | null;
};

export type ContractMetadata = {
  uri: string | null;
  fetched: boolean;
  name?: string;
  description?: string;
  image?: string;
  error?: string;
};

export type BaseReport = {
  status: ReportStatus;
  label: VerificationLabel;
  chainId: ChainId;
  chainName: string;
  address: Address;
  checkedAt: string;
  explorerUrl: string;
  identity: TokenIdentity;
  factory: FactoryEvidence;
  sources: SourceLink[];
  errors: string[];
};

export type NativeB20Report = BaseReport & {
  status: "native";
  label: "Native B20";
  b20Config: B20Config;
  policies: PolicyFact[];
  roles: RoleSummary;
  metadata: ContractMetadata;
};

export type NotNativeB20Report = BaseReport & {
  status: "not-native";
  label: "Not Native B20";
  b20Config: null;
  policies: [];
  roles: null;
  metadata: null;
};

export type UnavailableReport = BaseReport & {
  status: "unavailable";
  label: "Verification Unavailable";
  b20Config: null;
  policies: [];
  roles: null;
  metadata: null;
};

export type B20Report = NativeB20Report | NotNativeB20Report | UnavailableReport;

export type RecentCheck = {
  chainId: ChainId;
  address: Address;
  status: ReportStatus;
  label: VerificationLabel;
  checkedAt: string;
};
