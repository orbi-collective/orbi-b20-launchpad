export const B20_FACTORY_ADDRESS = "0xB20f000000000000000000000000000000000000" as const;
export const POLICY_REGISTRY_ADDRESS = "0x8453000000000000000000000000000000000002" as const;
export const ACTIVATION_REGISTRY_ADDRESS = "0x8453000000000000000000000000000000000001" as const;

export const b20FactoryAbi = [
  {
    type: "function",
    name: "isB20",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "isB20Initialized",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "event",
    name: "B20Created",
    anonymous: false,
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "variant", type: "uint8" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "symbol", type: "string" },
      { indexed: false, name: "decimals", type: "uint8" },
      { indexed: false, name: "variantEventParams", type: "bytes" }
    ]
  }
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export const b20Abi = [
  ...erc20Abi,
  {
    type: "function",
    name: "supplyCap",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "policyId",
    stateMutability: "view",
    inputs: [{ name: "policyScope", type: "bytes32" }],
    outputs: [{ name: "", type: "uint64" }]
  },
  {
    type: "function",
    name: "pausedFeatures",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8[]" }]
  },
  {
    type: "function",
    name: "isPaused",
    stateMutability: "view",
    inputs: [{ name: "feature", type: "uint8" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "contractURI",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "event",
    name: "RoleGranted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "role", type: "bytes32" },
      { indexed: true, name: "account", type: "address" },
      { indexed: true, name: "sender", type: "address" }
    ]
  },
  {
    type: "event",
    name: "RoleRevoked",
    anonymous: false,
    inputs: [
      { indexed: true, name: "role", type: "bytes32" },
      { indexed: true, name: "account", type: "address" },
      { indexed: true, name: "sender", type: "address" }
    ]
  }
] as const;

export const policyRegistryAbi = [
  {
    type: "function",
    name: "policyExists",
    stateMutability: "view",
    inputs: [{ name: "policyId", type: "uint64" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "policyAdmin",
    stateMutability: "view",
    inputs: [{ name: "policyId", type: "uint64" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "pendingPolicyAdmin",
    stateMutability: "view",
    inputs: [{ name: "policyId", type: "uint64" }],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

export const activationRegistryAbi = [
  {
    type: "function",
    name: "isActivated",
    stateMutability: "view",
    inputs: [{ name: "feature", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "admin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

export const b20StablecoinAbi = [
  {
    type: "function",
    name: "currency",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

export const b20AssetAbi = [
  {
    type: "function",
    name: "multiplier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "WAD_PRECISION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;
