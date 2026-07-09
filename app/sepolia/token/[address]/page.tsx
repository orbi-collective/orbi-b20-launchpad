import { ReportView } from "@/components/report-view";
import { buildReport } from "@/lib/report";
import { recordRecent } from "@/lib/recent";

export const dynamic = "force-dynamic";

export default async function SepoliaTokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const report = await buildReport(84532, address);
  await recordRecent(report);
  return <ReportView report={report} />;
}
