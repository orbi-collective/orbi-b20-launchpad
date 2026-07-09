"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { TargetAndTransition } from "motion/react";
import { motion } from "motion/react";
import type { B20Report, NativeB20Report, PolicyFact, RoleSummary } from "@/lib/types";
import { AddressChecker } from "@/components/address-checker";
import { StatusBadge } from "@/components/status-badge";

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function boolText(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Unable to determine";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <section className="report-section warning-section">
      <h2>Verification notes</h2>
      <ul className="note-list">
        {errors.slice(0, 8).map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </section>
  );
}

function Policies({ policies }: { policies: PolicyFact[] }) {
  return (
    <section className="report-section">
      <div className="section-heading">
        <h2>Policy controls</h2>
        <p>Policy IDs are shown as facts only. This page does not assign risk scores.</p>
      </div>
      <div className="policy-grid">
        {policies.map((policy) => (
          <div className="policy-card" key={policy.scopeName}>
            <div>
              <span className="eyeless-label">{policy.scopeName.replaceAll("_", " ")}</span>
              <h3>{policy.label}</h3>
            </div>
            <Field label="Policy ID" value={policy.policyId ?? "—"} />
            <Field label="Exists" value={boolText(policy.exists)} />
            <Field label="Admin" value={policy.admin ? shortAddress(policy.admin) : "None observed"} />
            <Field label="Pending admin" value={policy.pendingAdmin ? shortAddress(policy.pendingAdmin) : "None"} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Roles({ roles }: { roles: RoleSummary }) {
  return (
    <section className="report-section">
      <div className="section-heading">
        <h2>Role and control facts</h2>
        <p>{roles.note ?? `Scanned from block ${roles.fromBlock ?? "—"} to ${roles.toBlock ?? "—"}.`}</p>
      </div>
      <div className="role-summary">
        <StatusBadge status={roles.status === "observed" ? "native" : "unavailable"} label={roles.label} />
        {roles.holders.length > 0 ? (
          <div className="role-list">
            {roles.holders.map((role) => (
              <div className="role-row" key={role.role}>
                <span>{role.roleName}</span>
                <strong>{role.accounts.length} holder(s)</strong>
                <code>{role.accounts.slice(0, 3).map(shortAddress).join(", ")}</code>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No role holders were observed for the tracked B20 roles.</p>
        )}
      </div>
    </section>
  );
}

function NativeSections({ report }: { report: NativeB20Report }) {
  const transferPolicy = report.policies.find((policy) => policy.scopeName === "TRANSFER_SENDER_POLICY");

  return (
    <>
      <section className="report-section">
        <div className="section-heading">
          <h2>B20 configuration</h2>
          <p>Native token facts read from the B20 token and Base precompiles.</p>
        </div>
        <div className="facts-grid">
          <Field label="Variant" value={report.b20Config.variant} />
          <Field label="Supply status" value={report.b20Config.supply.label} />
          <Field label="Supply cap" value={report.b20Config.supply.cap ?? "—"} />
          <Field label="Pause state" value={report.b20Config.pause.label} />
          <Field label="Transfer policy" value={transferPolicy?.label ?? "Unable to determine"} />
          <Field label="Contract URI" value={report.b20Config.contractURI || "Not set"} />
        </div>
        {Object.keys(report.b20Config.variantFields).length > 0 ? (
          <div className="variant-fields">
            {Object.entries(report.b20Config.variantFields).map(([key, value]) => (
              <Field key={key} label={key} value={value ?? "—"} />
            ))}
          </div>
        ) : null}
      </section>
      <Policies policies={report.policies} />
      <Roles roles={report.roles} />
      <section className="report-section">
        <div className="section-heading">
          <h2>Contract metadata</h2>
          <p>Metadata is fetched from contractURI when the URI is HTTP(S) or IPFS.</p>
        </div>
        <div className="facts-grid">
          <Field label="URI" value={report.metadata.uri || "Not set"} />
          <Field label="Fetched" value={report.metadata.fetched ? "Yes" : "No"} />
          <Field label="Name" value={report.metadata.name ?? "—"} />
          <Field label="Description" value={report.metadata.description ?? report.metadata.error ?? "—"} />
        </div>
      </section>
    </>
  );
}

const cardDisclaimer = "OrbiB20 reports contract facts only. It does not make endorsement or risk-score claims.";

function ReportCard({ report, innerRef }: { report: B20Report; innerRef: React.RefObject<HTMLDivElement | null> }) {
  const native = report.status === "native" ? report : null;
  const transferPolicy = native?.policies.find((policy) => policy.scopeName === "TRANSFER_SENDER_POLICY");

  return (
    <div ref={innerRef} className="export-card">
      <div className="export-card-top">
        <span className="brand-mark">B20</span>
        <StatusBadge status={report.status} label={report.label} />
      </div>
      <h2>{report.identity.name ?? "Unknown token"}</h2>
      <p className="mono">{report.address}</p>
      <div className="export-card-grid">
        <Field label="Chain" value={report.chainName} />
        <Field label="Symbol" value={report.identity.symbol ?? "—"} />
        <Field label="Supply" value={report.identity.totalSupply ?? "—"} />
        <Field label="Supply status" value={native?.b20Config.supply.label ?? "—"} />
        <Field label="Transfer policy" value={transferPolicy?.label ?? "—"} />
        <Field label="Role summary" value={native?.roles.label ?? "—"} />
      </div>
      <p className="card-disclaimer">{cardDisclaimer}</p>
      <span className="checked-at">Checked {new Date(report.checkedAt).toLocaleString()}</span>
    </div>
  );
}

export function ReportView({ report }: { report: B20Report }) {
  const [copyState, setCopyState] = useState("Copy URL");
  const [exportState, setExportState] = useState("Export PNG");
  const [isPending, startTransition] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);
  const checkedAt = useMemo(() => new Date(report.checkedAt).toLocaleString(), [report.checkedAt]);
  // false = render at full opacity with no entrance (SSR, hidden tabs, crawlers).
  const [entranceInitial] = useState<TargetAndTransition | false>(() =>
    typeof document !== "undefined" && document.visibilityState === "visible" ? { opacity: 0, y: 16 } : false
  );

  async function copyUrl() {
    await navigator.clipboard.writeText(window.location.href);
    setCopyState("Copied");
    window.setTimeout(() => setCopyState("Copy URL"), 1400);
  }

  function exportCard() {
    startTransition(async () => {
      if (!cardRef.current) return;
      setExportState("Rendering…");
      const { toPng } = await import("html-to-image");
      const png = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#07101f"
      });
      const link = document.createElement("a");
      link.download = `b20-proof-${report.address.slice(2, 10)}.png`;
      link.href = png;
      link.click();
      setExportState("Export PNG");
    });
  }

  return (
    <main className="page report-page">
      <section className="report-hero">
        <motion.div
          className="report-summary"
          // Entrance only when the tab is actually visible: rAF pauses in hidden tabs
          // (background-tab opens, link-preview crawlers), which would freeze the proof
          // card at opacity 0. The visible default is the content; motion is the garnish.
          initial={entranceInitial}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="report-actions">
            <StatusBadge status={report.status} label={report.label} />
            <div className="action-row">
              <button className="secondary-button" onClick={copyUrl} type="button">
                {copyState}
              </button>
              <button className="secondary-button" disabled={isPending} onClick={exportCard} type="button">
                {exportState}
              </button>
            </div>
          </div>
          <h1>{report.identity.name ?? "Token report"}</h1>
          <p className="report-address mono">{report.address}</p>
          <div className="facts-grid">
            <Field label="Chain" value={report.chainName} />
            <Field label="Symbol" value={report.identity.symbol ?? "—"} />
            <Field label="Decimals" value={report.identity.decimals ?? "—"} />
            <Field label="Total supply" value={report.identity.totalSupply ?? "—"} />
            <Field label="Checked" value={checkedAt} />
            <Field
              label="BaseScan"
              value={
                <a href={report.explorerUrl} target="_blank" rel="noreferrer">
                  Open address
                </a>
              }
            />
          </div>
        </motion.div>
        <div className="report-search">
          <AddressChecker compact />
        </div>
      </section>

      <section className="report-section">
        <div className="section-heading">
          <h2>Factory evidence</h2>
          <p>Native status is based on the Base B20 Factory precompile, not the token name or symbol.</p>
        </div>
        <div className="facts-grid">
          <Field label="Factory" value={shortAddress(report.factory.factoryAddress)} />
          <Field label="Factory says B20" value={boolText(report.factory.isB20)} />
          <Field label="Initialized" value={boolText(report.factory.isB20Initialized)} />
          <Field label="Variant byte" value={report.factory.variantByte ?? "—"} />
          <Field label="Variant" value={report.factory.variant} />
          <Field label="Creation block" value={report.factory.creationBlock ?? "—"} />
        </div>
      </section>

      {report.status === "native" ? (
        <NativeSections report={report} />
      ) : (
        <section className="report-section">
          <div className="section-heading">
            <h2>{report.status === "not-native" ? "Not Native B20" : "Verification Unavailable"}</h2>
            <p>
              {report.status === "not-native"
                ? report.factory.isB20 && !report.factory.isB20Initialized
                  ? "The address matches the B20 prefix, but the factory did not confirm completed initialization."
                  : "The Base B20 Factory did not confirm this address as an initialized native B20 token."
                : "The verifier could not complete the required factory reads. Try again with another RPC or later."}
            </p>
          </div>
        </section>
      )}

      <ErrorList errors={report.errors} />

      <section className="report-section source-section">
        <h2>Sources</h2>
        <div className="source-links">
          {report.sources.map((source) => (
            <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
              {source.label}
            </a>
          ))}
        </div>
        <p className="disclaimer">{cardDisclaimer}</p>
      </section>

      <div className="export-card-shell" aria-hidden="true">
        <ReportCard report={report} innerRef={cardRef} />
      </div>
    </main>
  );
}
