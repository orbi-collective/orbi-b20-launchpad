import Link from "next/link";

export default function HowItWorksPage() {
  return (
    <main className="page content-page">
      <section className="content-hero">
        <h1>Native B20 is a Factory fact, not a naming convention.</h1>
        <p>
          A token can include “B20” in its name or symbol and still be a regular ERC-20. OrbiB20 treats the Base B20
          Factory precompile as the source of verification.
        </p>
      </section>

      <section className="explain-grid">
        <article className="explain-card">
          <h2>Native B20</h2>
          <p>
            The Factory confirms the address matches the B20 address space and that creation completed. The report then
            reads native B20 fields such as supply cap, policies, pause state, contractURI, and role events.
          </p>
        </article>
        <article className="explain-card">
          <h2>Not Native B20</h2>
          <p>
            The Factory does not confirm the contract as an initialized native B20. OrbiB20 may still show best-effort
            ERC-20 identity fields, but it does not promote name or symbol matching into a B20 verdict.
          </p>
        </article>
        <article className="explain-card">
          <h2>Verification Unavailable</h2>
          <p>
            Required RPC or precompile reads failed. The report keeps this state explicit so downstream pages do not
            confuse missing data with a confirmed result.
          </p>
        </article>
      </section>

      <section className="report-section">
        <h2>What the MVP intentionally leaves out</h2>
        <p>
          No token deploy UI, launchpad, wallet custody, swaps, liquidity routing, trading signals, automatic full index,
          or proprietary score. Those are separate products. This MVP is a public verifier.
        </p>
        <Link className="primary-link" href="/">
          Check a token
        </Link>
      </section>
    </main>
  );
}
