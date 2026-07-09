import { describe, expect, it } from "vitest";
import { buildReport } from "@/lib/report";

describe("report states", () => {
  it("returns unavailable for invalid addresses without hitting RPC", async () => {
    const report = await buildReport(8453, "not-an-address");

    expect(report.status).toBe("unavailable");
    expect(report.label).toBe("Verification Unavailable");
    expect(report.errors[0]).toContain("Invalid EVM address");
  });
});
