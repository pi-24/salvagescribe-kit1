"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import UserMenu from "./UserMenu.jsx";
export default function AppShell({ children }) {
  const path = usePathname();
  if (path === "/") return children;
  return <><header className="marketplace-header"><div className="header-tier-primary"><Link href="/" className="brand-lockup"><span className="brand-icon">S</span><span className="brand-title">SalvageScribe</span></Link><UserMenu /></div></header><main className="workspace-content">{children}</main></>;
}
