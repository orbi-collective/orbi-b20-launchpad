import { NextResponse } from "next/server";
import { parseChainId } from "@/lib/chains";
import { buildReport } from "@/lib/report";
import { recordRecent } from "@/lib/recent";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chainId = parseChainId(searchParams.get("chainId"));
  const address = searchParams.get("address");

  if (!chainId) {
    return NextResponse.json({ error: "Unsupported chainId. Use 8453 or 84532." }, { status: 400 });
  }

  if (!address) {
    return NextResponse.json({ error: "Missing address query parameter." }, { status: 400 });
  }

  const report = await buildReport(chainId, address);
  await recordRecent(report);

  return NextResponse.json(report, {
    headers: {
      "cache-control": "no-store"
    }
  });
}
