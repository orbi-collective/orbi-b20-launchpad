import Link from "next/link";
import { LaunchHero } from "@/components/launch-hero";
import { AmbientLiquid } from "@/components/ambient-liquid";
import { TokenAvatar } from "@/components/token-avatar";
import { getRecentLaunches } from "@/lib/explore";
import { MAINNET_LIVE, tokenRoute } from "@/lib/chains";

export const dynamic = "force-dynamic";

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default async function HomePage() {
  // Mainnet launches lead once creation is live there; Sepolia fills the feed while mainnet is quiet.
  const [mainnet, sepolia] = await Promise.all([
    MAINNET_LIVE ? getRecentLaunches(8453, 10) : Promise.resolve(null),
    getRecentLaunches(84532, 10)
  ]);
  const items = [...(mainnet?.items ?? []), ...sepolia.items].slice(0, 10);
  const mixed = MAINNET_LIVE && items.some((i) => i.chainId === 84532);
  const strip = items.slice(0, 4);
  const ticker = items.map((i) => ({ address: i.address, symbol: i.symbol, name: i.name }));

  return (
    <main className="page home-page">
      <LaunchHero launches={ticker} />

      <div className="home-lower">
        <AmbientLiquid />

        <section className="split-section">
          <div>
            <h2>One transaction, a real onchain token.</h2>
            <p>
              B20 is Base&rsquo;s native token standard: a precompile, not a contract you deploy and hope to verify. The
              launch flow encodes the Factory call for you, previews the deterministic address before you sign, and runs the
              initial mint and policy in the same transaction.
            </p>
            <Link className="primary-btn home-cta" href="/launch">
              Start a launch
            </Link>
          </div>

          <div className="recent-shell">
            <div className="section-heading compact-heading">
              <h3>Recently launched</h3>
              <Link className="recent-see-all" href="/explore">
                Explore all
              </Link>
            </div>
            {strip.length > 0 ? (
              <ul className="launch-feed">
                {strip.map((item) => (
                  <li key={item.address}>
                    <Link className="launch-feed-row" href={tokenRoute(item.chainId, item.address)}>
                      <TokenAvatar symbol={item.symbol} size={34} />
                      <span className="feed-identity">
                        <strong>{item.name || "Unnamed token"}</strong>
                        <span className="feed-symbol mono">
                          {item.symbol || "—"}
                          {mixed && item.chainId === 84532 ? " · Sepolia" : ""}
                        </span>
                      </span>
                      <span className={`feed-variant ${item.variant}`}>{item.variant}</span>
                      <code className="feed-addr">{shortAddress(item.address)}</code>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="recent-empty-line">No launches in the recent window yet. Yours could be the first.</p>
            )}
          </div>
        </section>

        <section className="feature-strip">
          <article>
            <h3>Native, not deployed</h3>
            <p>
              The token runs as a Base precompile. Cheaper and faster than an EVM contract, with no bytecode to audit and
              no proxy to trust.
            </p>
          </article>
          <article>
            <h3>Compliance built in</h3>
            <p>
              Roles, transfer policies, pause, supply caps, and memos ship with the standard. Configure what you need at
              launch, leave the rest open.
            </p>
          </article>
          <article>
            <h3>Verifiable by anyone</h3>
            <p>
              Every token you launch is provable against the Factory. Share its <Link href="/verify">proof report</Link> so
              holders can confirm it is genuinely native B20.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
