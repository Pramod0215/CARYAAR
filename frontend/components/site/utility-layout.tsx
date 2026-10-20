import Link from "next/link";
import { ArrowUpRight, CarFront } from "lucide-react";
import type { ReactNode } from "react";

type UtilityLayoutProps = {
  children: ReactNode;
  active: "support" | "feedback";
};

export default function UtilityLayout({ children, active }: UtilityLayoutProps) {
  return (
    <div className="page-shell utility-shell">
      <header className="site-header">
        <Link aria-label="CarYAAR home" className="brand" href="/">
          <span className="brand-mark"><CarFront aria-hidden="true" size={21} /></span>
          car<span>YAAR</span>
        </Link>
        <nav aria-label="Main navigation" className="header-nav">
          <Link href="/#cars">Buy a car</Link>
          <Link aria-current={active === "support" ? "page" : undefined} className={active === "support" ? "utility-nav-active" : undefined} href="/support">Support</Link>
          <Link aria-current={active === "feedback" ? "page" : undefined} className={active === "feedback" ? "utility-nav-active" : undefined} href="/feedback">Feedback</Link>
        </nav>
        <Link className="sell-button utility-browse-button" href="/">
          Browse cars <ArrowUpRight aria-hidden="true" size={14} />
        </Link>
      </header>
      <main className="utility-main">{children}</main>
      <footer className="site-footer utility-footer">
        <Link className="footer-brand" href="/">carYAAR</Link>
        <span>Here for the journey, too.</span>
        <div className="utility-footer-links">
          <Link aria-current={active === "support" ? "page" : undefined} href="/support">Support</Link>
          <Link aria-current={active === "feedback" ? "page" : undefined} href="/feedback">Feedback</Link>
        </div>
      </footer>
    </div>
  );
}
