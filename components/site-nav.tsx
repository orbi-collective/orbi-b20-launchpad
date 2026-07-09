"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
  isActive?: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/launch", label: "Launch", isActive: (p) => p.startsWith("/launch") },
  { href: "/explore", label: "Explore", isActive: (p) => p.startsWith("/explore") || p.includes("/coin/") },
  { href: "/verify", label: "Verify", isActive: (p) => p === "/verify" || p.includes("/token/") },
  { href: "/status", label: "Status", isActive: (p) => p.startsWith("/status") },
  {
    href: "https://docs.base.org/base-chain/specs/upgrades/beryl/b20",
    label: "Docs",
    external: true
  }
];

export function SiteNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="top-nav" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive?.(pathname) ?? false;

        if (item.external) {
          return (
            <a key={item.href} href={item.href} target="_blank" rel="noreferrer">
              {item.label}
            </a>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
