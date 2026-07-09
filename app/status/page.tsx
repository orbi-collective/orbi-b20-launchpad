import { readActivationStatus } from "@/lib/report";

export const dynamic = "force-dynamic";

type Status = Awaited<ReturnType<typeof readActivationStatus>>;

function Verdict({ ok, live, down }: { ok: boolean; live: string; down: string }) {
  return (
    <span className={`live-pill ${ok ? "live-pill-ok" : "live-pill-down"}`}>
      <i aria-hidden="true" />
      {ok ? live : down}
    </span>
  );
}

function shortHash(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function NetworkCard({ status }: { status: Status }) {
  return (
    <section className="report-section status-card">
      <div className="section-heading">
        <h2>{status.chainName}</h2>
        <p className="mono">{status.rpcUrl}</p>
      </div>

      <div className="live-grid">
        <div className="live-row">
          <div className="live-row-label">
            <strong>Base chain</strong>
            <span>Is the network reachable and producing blocks?</span>
          </div>
          <Verdict ok={status.chainLive} live="Live" down="Unreachable" />
        </div>
        <div className="live-row">
          <div className="live-row-label">
            <strong>B20 protocol</strong>
            <span>Is the B20 factory precompile deployed on this network?</span>
          </div>
          <Verdict ok={status.b20Live} live="Live on Base" down="Not yet live" />
        </div>
        <div className="live-row">
          <div className="live-row-label">
            <strong>Token creation</strong>
            <span>Are the Asset and Stablecoin variants activated for createB20?</span>
          </div>
          <Verdict ok={status.features.every((f) => f.active === true)} live="Open" down="Not yet open" />
        </div>
      </div>

      <div className="facts-grid">
        <div className="field">
          <span>Latest block</span>
          <strong>{status.blockNumber ? `#${Number(status.blockNumber).toLocaleString()}` : "Unable to read"}</strong>
        </div>
        <div className="field">
          <span>RPC round-trip</span>
          <strong>{status.latencyMs}ms</strong>
        </div>
        <div className="field">
          <span>Activation registry</span>
          <strong>{status.admin !== null ? "Responding" : "No response"}</strong>
        </div>
        <div className="field">
          <span>B20 Factory</span>
          <strong className="mono">{shortHash(status.factory)}</strong>
        </div>
        <div className="field">
          <span>Policy Registry</span>
          <strong className="mono">{shortHash(status.policyRegistry)}</strong>
        </div>
        <div className="field">
          <span>Activation admin</span>
          <strong className="mono">{status.admin ? shortHash(status.admin) : "Unreadable"}</strong>
        </div>
        {status.features.map((f) => (
          <div className="field" key={f.name}>
            <span>{f.name === "B20_ASSET" ? "Asset variant" : "Stablecoin variant"}</span>
            <strong>{f.active === true ? "Activated" : f.active === false ? "Not activated" : "Unable to read"}</strong>
          </div>
        ))}
      </div>

      {!status.b20Live && status.chainLive ? (
        <p className="status-note">
          The Base chain is healthy, but the B20 factory precompile at {shortHash(status.factory)} returned no data on{" "}
          {status.chainName}. B20 is not deployed on this network yet — token verification will report{" "}
          <em>Verification Unavailable</em> here until the precompile goes live.
        </p>
      ) : null}
    </section>
  );
}

export default async function StatusPage() {
  const statuses = await Promise.all([readActivationStatus(8453), readActivationStatus(84532)]);

  return (
    <main className="page content-page">
      <section className="content-hero">
        <h1>Is B20 live on Base?</h1>
        <p>
          Three checks per network, read live from the chain: whether the Base RPC is healthy and producing blocks,
          whether the B20 factory precompile is deployed, and whether token creation is activated for both variants. No
          claims, just what the chain answers right now.
        </p>
      </section>

      <div className="status-grid">
        {statuses.map((status) => (
          <NetworkCard key={status.chainId} status={status} />
        ))}
      </div>
    </main>
  );
}
