# Product

## Register

brand

## Users

People who arrive with a single Base token address and need to decide whether to trust it, fast:

- **Traders / buyers** — confirming a token is genuinely native B20 (factory-confirmed) before they buy, often on mobile and skeptical.
- **Issuers / founders** — proving their own B20 is native, with shareable, on-chain-backed evidence.
- **Auditors / researchers** — checking contract facts (supply cap, transfer policies, role holders, pause state) without trusting name or symbol.
- **Base developers** — integrating with or building on top of B20.

Primary user now is the **issuer/founder** launching a token; traders and auditors are served by verify and explore.

## Product Purpose

OrbiB20 (formerly B20 Proof / LaunchB20) is a **launch-led hub** for Base-native B20 tokens, built on three surfaces:

- **Launch** (the lead): a guided flow that deploys a native B20 in one transaction by calling the canonical Factory precompile `createB20`, with deterministic address preview, in-transaction bootstrap (initial mint, supply cap, roles, policies), and the Asset/Stablecoin variants. Live on Base Sepolia now; Mainnet auto-enables when Base activates the variant features.
- **Explore**: a lite "recently launched" feed read from `B20Created` events.
- **Verify** (the original strength): answers "is this token actually native B20?" by reading `isB20` / `isB20Initialized` from the Factory rather than trusting name or symbol, then surfaces supply, policies, pause, roles, and metadata as a shareable proof.

It still reads on-chain truth rather than charting price; no tickers, candlesticks, or liquidity widgets. The product now connects a wallet (for launching) but stays evidence-first everywhere it reports.

## Brand Personality

Premium and cutting-edge, but never hype. Three words: **authoritative, cinematic, exact**. The surface is high-end infrastructure — flowing liquid-glass and a glossy liquid-metal hero — yet every claim on screen maps to a real on-chain read. Confident and factual voice; it shows proof instead of making promises.

## Anti-references

- **Generic SaaS template** — cream/off-white backgrounds, a tiny uppercase tracked eyebrow above every section, identical icon+heading+text card grids, the big-number hero-metric template.
- **AI slop** — decorative glassmorphism everywhere, gradient text, anything that reads as auto-generated.
- **Memecoin / launchpad hype and busy trading dashboards** (implicit) — no tickers, candlestick charts, emoji, or gambling energy.

## Design Principles

1. **Verdict first, evidence underneath.** The answer (Native B20 / Not Native / Unavailable) is the loudest element; every fact exists to support it.
2. **Read, don't claim.** Every statement maps to an on-chain read. When a read fails, say "unable to determine" rather than guessing or faking it.
3. **One continuous premium surface.** The liquid material is consistent from hero to footer; no section looks like a different template was pasted in.
4. **Restraint over decoration.** Glass, shader, and motion earn their place by reinforcing trust, not as ornament. If an effect doesn't add credibility or clarity, cut it.
5. **Honest under failure.** Degraded RPC, rate-limits, and not-yet-live states are first-class: shown plainly, never hidden behind a fake success.

## Accessibility & Inclusion

Target **WCAG 2.2 AA**. Body and label text must clear 4.5:1 on the dark surface — watch muted blue-grays, the most likely failure here. Respect `prefers-reduced-motion`: the hero and ambient shaders fall back to static gradients (already implemented). Never encode meaning in color alone — verdict states pair color with text and an icon/dot. Keep `aria` labels on the verifier form and nav, maintain visible focus states, and keep the mono address/hex readable at small sizes.
