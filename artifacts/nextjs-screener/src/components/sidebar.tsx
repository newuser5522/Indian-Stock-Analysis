"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Search,
  Star,
  Menu,
  X,
  ChevronRight,
  Briefcase,
  Globe2,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Market", icon: TrendingUp },
  { href: "/sectors", label: "Sectors", icon: Globe2 },
  { href: "/screener", label: "Screener", icon: Search },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/news", label: "News", icon: Newspaper },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-primary/10 text-sidebar-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
      {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-[60] flex h-9 w-9 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "shrink-0 fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200",
          "w-60 md:relative md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-sidebar-border shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary/10">
            <BarChart3 className="h-4 w-4 text-sidebar-primary" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-sidebar-foreground">
              FinTrack
            </div>
            <div className="text-[10px] text-muted-foreground leading-none">
              Indian Stock Analytics
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          <div className="px-2 pb-1 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Navigation
            </p>
          </div>
          {NAV.map(({ href, label, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={
                href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(href)
              }
              onClick={() => setOpen(false)}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border">
          <p className="text-[10px] text-muted-foreground text-center">
            NSE · BSE · Live data · v2.0
          </p>
        </div>
      </aside>
    </>
  );
}
