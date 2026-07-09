import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Hanken_Grotesk } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import { ConnectButton } from "@/components/connect-button";
import { Logo } from "@/components/logo";
import { Providers } from "@/app/providers";
import "./globals.css";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

// Vercel sets these automatically at build time; no env config needed. Falls back to
// localhost so `next dev` and `next build` still work outside Vercel.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  title: "OrbiB20 — Launch, explore, and verify Base-native B20 tokens",
  description: "Launch a native B20 token on Base in one transaction, explore recent launches, and verify any token against the canonical B20 Factory.",
  metadataBase: new URL(siteUrl)
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#07101f"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <Providers>
          <header className="site-header">
            <div className="site-header-inner">
              <Link className="brand" href="/" aria-label="OrbiB20 home">
                <Logo size={34} className="brand-logo" />
                <span className="brand-wordmark">
                  <span className="brand-launch">Orbi</span>
                  <span className="brand-b20">B20</span>
                </span>
              </Link>
              <SiteNav />
              <div className="header-actions">
                <a className="orynth-badge" href="https://orynth.dev/projects/orbi" target="_blank" rel="noopener noreferrer">
                  {/* External badge served by Orynth; must match their image exactly, so a plain img (not next/image). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="https://orynth.dev/api/badge/orbi?theme=dark&style=minimal" alt="Featured on Orynth" width={152} height={48} />
                </a>
                <ConnectButton />
              </div>
            </div>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
