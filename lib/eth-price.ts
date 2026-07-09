// Server-side ETH/USD spot price with a 60s in-memory cache. Used to express
// curve market caps in dollars. Fails soft: callers get null and fall back to
// ETH denomination instead of showing a made-up rate.

let cached: { price: number; at: number } | null = null;

export async function getEthUsd(): Promise<number | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.price;
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4_000)
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: { amount?: string } };
      const price = Number(json?.data?.amount);
      if (Number.isFinite(price) && price > 0) {
        cached = { price, at: Date.now() };
        return price;
      }
    }
  } catch {
    // fall through to stale cache / null
  }
  return cached?.price ?? null;
}
