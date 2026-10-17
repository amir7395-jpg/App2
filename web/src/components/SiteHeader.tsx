import Link from "next/link";
import { config } from "@/lib/config";

export function Logo() {
  return (
    <Link href="/" className="logo">
      {config.brandName}
      <span>.</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Logo />
        <nav className="nav">
          <Link href="/#features" className="hide-sm">Features</Link>
          <Link href="/#how" className="hide-sm">How it works</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Log in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Get started</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container spread">
        <span>© {new Date().getFullYear()} {config.brandName}</span>
        <span className="row">
          <Link href="/pricing">Pricing</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </span>
      </div>
    </footer>
  );
}
