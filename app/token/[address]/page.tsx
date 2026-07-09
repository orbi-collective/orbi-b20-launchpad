import { ReportView } from "@/components/report-view";
import { buildReport } from "@/lib/report";
import { recordRecent } from "@/lib/recent";

export const dynamic = "force-dynamic";

export default async function MainnetTokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const report = await buildReport(8453, address);
  await recordRecent(report);
  return <ReportView report={report} />;
}
