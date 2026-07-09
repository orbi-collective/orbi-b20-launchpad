import Link from "next/link";
import { TokenTradeView } from "@/components/launchpad/token-trade-view";
import { getCoinPageData } from "@/lib/launchpad";
import { getEthUsd } from "@/lib/eth-price";

export const dynamic = "force-dynamic";

export default async function MainnetCoinPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const [data, ethUsd] = await Promise.all([getCoinPageData(8453, address), getEthUsd()]);

  if (!data) {
    return (
      <main className="page coin-page">
        <section className="content-hero">
          <h1>No launch found</h1>
          <p>This address hasn&apos;t launched a bonding-curve token through OrbiB20 on Base Mainnet.</p>
          <Link className="primary-btn home-cta" href="/explore">
            Back to the board
          </Link>
        </section>
      </main>
    );
  }

  return <TokenTradeView data={data} ethUsd={ethUsd} />;
}
