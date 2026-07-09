# OrbiB20 CurveLaunchpad — deploy & test targets.
# Deployer identity: encrypted Foundry keystore (never a raw private key in env).
#   ACCOUNT       keystore name under ~/.foundry/keystores (default: orbi-deployer)
#   PASSWORD_FILE file holding the keystore password       (default: ~/.orbi/deployer.pass)

ACCOUNT ?= orbi-deployer
PASSWORD_FILE ?= $(HOME)/.orbi/deployer.pass
SEPOLIA_RPC ?= https://sepolia.base.org
MAINNET_RPC ?= https://mainnet.base.org
FORGE ?= forge

.PHONY: test fork-test deployer-address deployer-balance deploy-sepolia deploy-mainnet

test:
	$(FORGE) test

## Runs the router fork test against real Base Sepolia (network required).
fork-test:
	FORK_SEPOLIA=true $(FORGE) test --match-contract SepoliaLiquidityRouterForkTest -vv

deployer-address:
	@cast wallet address --account $(ACCOUNT) --password-file $(PASSWORD_FILE)

deployer-balance:
	@ADDR=$$(cast wallet address --account $(ACCOUNT) --password-file $(PASSWORD_FILE)); \
	echo "deployer: $$ADDR"; \
	echo "sepolia : $$(cast balance $$ADDR --rpc-url $(SEPOLIA_RPC) --ether) ETH"; \
	echo "mainnet : $$(cast balance $$ADDR --rpc-url $(MAINNET_RPC) --ether) ETH"

## Deploys SepoliaLiquidityRouter + CurveLaunchpad to Base Sepolia in one broadcast.
deploy-sepolia:
	$(FORGE) script script/CurveLaunchpad.s.sol:DeploySepoliaStack \
		--rpc-url $(SEPOLIA_RPC) --account $(ACCOUNT) --password-file $(PASSWORD_FILE) \
		--broadcast -vv

## Mainnet is audit-gated: the script refuses to run unless CONFIRM_MAINNET=audited.
## Uses the canonical Uniswap V2 Router02 on Base unless ROUTER is overridden.
deploy-mainnet:
ifneq ($(CONFIRM_MAINNET),audited)
	$(error CurveLaunchpad custodies user funds and must be audited first. After the audit, run: make deploy-mainnet CONFIRM_MAINNET=audited)
endif
	CONFIRM_MAINNET=audited $(FORGE) script script/CurveLaunchpad.s.sol:DeployCurveLaunchpadMainnet \
		--rpc-url $(MAINNET_RPC) --account $(ACCOUNT) --password-file $(PASSWORD_FILE) \
		--broadcast -vv
