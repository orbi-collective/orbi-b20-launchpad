import { ExploreBoard } from "@/components/launchpad/explore-board";
import { LaunchesBoard, type LaunchBoardItem } from "@/components/launchpad/launches-board";
import { getLiveBoard } from "@/lib/launchpad";
import { getRecentLaunches, type ExploreResult } from "@/lib/explore";
import { getEthUsd } from "@/lib/eth-price";
import { curveAddress } from "@/lib/curve";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore launches",
  description: "B20 tokens launched on Base, read live from the Factory precompile and the OrbiB20 curve."
};

const BASE_BLOCK_SECONDS = 2;

function withAge(result: ExploreResult): LaunchBoardItem[] {
  const latest = result.latestBlock ? BigInt(result.latestBlock) : null;
  return result.items.map((item) => ({
    ...item,
    ageMinutes: latest !== null ? Math.max(0, Math.round((Number(latest - BigInt(item.block)) * BASE_BLOCK_SECONDS) / 60)) : null
  }));
}

export default async function ExplorePage() {
  // Curve board once the CurveLaunchpad is deployed (mainnet preferred); until then,
  // real B20Created launches straight from the Factory precompile.
  const curveChain = curveAddress(8453) ? (8453 as const) : curveAddress(84532) ? (84532 as const) : null;

  if (curveChain) {
    const [board, ethUsd] = await Promise.all([getLiveBoard(curveChain), getEthUsd()]);
    return (
      <main className="page explore-page">
        <header className="content-hero">
          <h1>The board</h1>
          <p>
            Tokens launched through OrbiB20, trading on their bonding curves. Prices and reserves are read from the
            curve contract onchain; progress fills toward graduation, when liquidity migrates to a Base DEX.
          </p>
        </header>
        <ExploreBoard tokens={board.tokens} ethUsd={ethUsd} scannedBlocks={board.scannedBlocks} error={board.error} />
      </main>
    );
  }

  const [mainnet, sepolia] = await Promise.all([getRecentLaunches(8453, 20), getRecentLaunches(84532, 10)]);
  const items = [...withAge(mainnet), ...withAge(sepolia)].slice(0, 24);

  return (
    <main className="page explore-page">
      <header className="content-hero">
        <h1>The board</h1>
        <p>
          Every row is a real B20 token, read live from the Base Factory precompile. Mainnet launches lead. Open any
          token for its onchain proof report; bonding-curve trading arrives here when the OrbiB20 curve deploys.
        </p>
      </header>
      <LaunchesBoard items={items} error={mainnet.error ?? sepolia.error} />
    </main>
  );
}
