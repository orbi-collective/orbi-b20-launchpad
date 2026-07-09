import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Hanken_Grotesk } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import { ConnectButton } from "@/components/connect-button";
import { Logo } from "@/components/logo";
import { Providers } from "@/app/providers";
import "./globals.css";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "OrbiB20 — Launch, explore, and verify Base-native B20 tokens",
  description: "Launch a native B20 token on Base in one transaction, explore recent launches, and verify any token against the canonical B20 Factory.",
  metadataBase: new URL("https://orbib20.local")
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
                <a className="built-on-base" href="https://base.org" target="_blank" rel="noreferrer">
                  Built on <span>Base</span>
                  <i aria-hidden="true" />
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
