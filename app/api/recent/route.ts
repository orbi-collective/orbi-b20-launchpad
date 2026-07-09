import { NextResponse } from "next/server";
import { parseChainId } from "@/lib/chains";
import { getRecent } from "@/lib/recent";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chainId = parseChainId(searchParams.get("chainId")) ?? 8453;
  const recent = await getRecent(chainId);

  return NextResponse.json({ chainId, recent }, { headers: { "cache-control": "no-store" } });
}
