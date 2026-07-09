import { CinematicHero } from "@/components/cinematic-hero";
import { AmbientLiquid } from "@/components/ambient-liquid";
import { RecentChecks } from "@/components/recent-checks";
import { getRecent } from "@/lib/recent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verify a B20 token",
  description: "Check whether a token is actually native B20, read from the canonical Base Factory."
};

export default async function VerifyPage() {
  const [mainnetRecent, sepoliaRecent] = await Promise.all([getRecent(8453), getRecent(84532)]);
  const hasRecent = mainnetRecent.length > 0 || sepoliaRecent.length > 0;

  return (
    <main className="page home-page">
      <CinematicHero />

      <div className="home-lower">
        <AmbientLiquid />

        <section className="split-section">
          <div>
            <h2>Native B20 is a Factory fact, not a naming convention.</h2>
            <p>
              A token can carry &ldquo;B20&rdquo; in its name and still be a plain ERC-20. Verify reads `isB20` and
              `isB20Initialized` from the canonical Factory precompile, then surfaces supply, policies, pause state, and
              role holders as evidence you can share.
            </p>
          </div>
          <div className="recent-shell">
            <div className="section-heading compact-heading">
              <h3>Recent checks</h3>
            </div>
            {hasRecent ? (
              <div className="recent-groups">
                {mainnetRecent.length > 0 ? (
                  <div>
                    <p className="recent-group-label">Mainnet</p>
                    <RecentChecks checks={mainnetRecent} />
                  </div>
                ) : null}
                {sepoliaRecent.length > 0 ? (
                  <div>
                    <p className="recent-group-label">Sepolia</p>
                    <RecentChecks checks={sepoliaRecent} />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="recent-empty-line">No checks yet. Tokens you verify will appear here, newest first.</p>
            )}
          </div>
        </section>

        <section className="feature-strip">
          <article>
            <h3>Factory evidence</h3>
            <p>
              Reads <code>isB20</code> and <code>isB20Initialized</code> straight from the canonical Factory precompile.
            </p>
          </article>
          <article>
            <h3>Issuer controls</h3>
            <p>Shows supply cap, policy IDs, pause state, metadata URI, and observed B20 role holders.</p>
          </article>
          <article>
            <h3>Shareable proof</h3>
            <p>Every report has a canonical URL and a user-triggered PNG export card.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
