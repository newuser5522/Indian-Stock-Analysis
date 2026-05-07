import { Link, useLocation } from "wouter";
import { TrendingUp, Search, Eye, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Market", icon: TrendingUp },
  { href: "/screener", label: "Screener", icon: BarChart2 },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
];

export default function Navbar() {
  const [location] = useLocation();

  const isMarketOpen = (() => {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const day = ist.getDay();
    const h = ist.getHours();
    const m = ist.getMinutes();
    const mins = h * 60 + m;
    return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
  })();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-primary">
            <TrendingUp className="h-5 w-5" />
            <span className="font-mono tracking-tight">NSE<span className="text-emerald-400">•</span>Live</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  location === href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono font-medium",
            isMarketOpen ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", isMarketOpen ? "bg-emerald-400" : "bg-red-400")} />
            {isMarketOpen ? "Market Open" : "Market Closed"}
          </span>
        </div>
      </div>
      <nav className="md:hidden flex border-t border-border bg-background">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              location === href ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
