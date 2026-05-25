"use client";

import { useState } from "react";
import { CalendarDays, Star, Globe, TrendingUp, Building } from "lucide-react";

interface CalEvent {
  date: string;
  title: string;
  type: "holiday" | "rbi" | "global" | "earnings" | "macro";
  description?: string;
  impact?: "high" | "medium" | "low";
}

const EVENTS: CalEvent[] = [
  // Indian Market Holidays 2026
  { date: "2026-01-26", title: "Republic Day", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-03-17", title: "Holi", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-04-02", title: "Ram Navami", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-04-03", title: "Good Friday", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-04-14", title: "Dr. Ambedkar Jayanti", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-05-01", title: "Maharashtra Day", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-08-15", title: "Independence Day", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-08-27", title: "Ganesh Chaturthi", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-10-02", title: "Gandhi Jayanti", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-10-22", title: "Dussehra (Dasara)", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-11-12", title: "Diwali - Laxmi Pujan", type: "holiday", description: "NSE/BSE closed — Muhurat Trading" },
  { date: "2026-11-13", title: "Diwali Balipratipada", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-11-25", title: "Guru Nanak Jayanti", type: "holiday", description: "NSE/BSE closed" },
  { date: "2026-12-25", title: "Christmas", type: "holiday", description: "NSE/BSE closed" },

  // RBI MPC Meetings 2026
  { date: "2026-02-05", title: "RBI MPC Meeting", type: "rbi", description: "Monetary Policy Committee decision", impact: "high" },
  { date: "2026-02-07", title: "RBI Policy Rate Decision", type: "rbi", description: "Repo rate announcement", impact: "high" },
  { date: "2026-04-03", title: "RBI MPC Meeting", type: "rbi", description: "Monetary Policy Committee decision", impact: "high" },
  { date: "2026-04-09", title: "RBI Policy Rate Decision", type: "rbi", description: "Repo rate announcement", impact: "high" },
  { date: "2026-06-04", title: "RBI MPC Meeting", type: "rbi", description: "Monetary Policy Committee decision", impact: "high" },
  { date: "2026-06-06", title: "RBI Policy Rate Decision", type: "rbi", description: "Repo rate announcement", impact: "high" },
  { date: "2026-08-06", title: "RBI MPC Meeting", type: "rbi", description: "Monetary Policy Committee decision", impact: "high" },
  { date: "2026-10-08", title: "RBI MPC Meeting", type: "rbi", description: "Monetary Policy Committee decision", impact: "high" },
  { date: "2026-12-04", title: "RBI MPC Meeting", type: "rbi", description: "Monetary Policy Committee decision", impact: "high" },

  // Indian Macro Events
  { date: "2026-02-01", title: "Union Budget 2026-27", type: "macro", description: "Annual Union Budget presentation by Finance Minister", impact: "high" },
  { date: "2026-01-31", title: "Economic Survey 2025-26", type: "macro", description: "Pre-budget economic overview", impact: "medium" },
  { date: "2026-05-31", title: "GDP Q4 FY26 Data", type: "macro", description: "India GDP growth rate Q4 FY26", impact: "high" },
  { date: "2026-08-31", title: "GDP Q1 FY27 Data", type: "macro", description: "India GDP growth rate Q1 FY27", impact: "high" },
  { date: "2026-03-12", title: "CPI Inflation Data (Feb)", type: "macro", description: "Consumer Price Index monthly release", impact: "medium" },
  { date: "2026-04-14", title: "CPI Inflation Data (Mar)", type: "macro", description: "Consumer Price Index monthly release", impact: "medium" },
  { date: "2026-05-13", title: "CPI Inflation Data (Apr)", type: "macro", description: "Consumer Price Index monthly release", impact: "medium" },
  { date: "2026-06-12", title: "CPI Inflation Data (May)", type: "macro", description: "Consumer Price Index monthly release", impact: "medium" },

  // Global Events
  { date: "2026-01-28", title: "US Fed Meeting (FOMC)", type: "global", description: "Federal Open Market Committee policy decision", impact: "high" },
  { date: "2026-03-18", title: "US Fed Meeting (FOMC)", type: "global", description: "Federal Open Market Committee policy decision", impact: "high" },
  { date: "2026-05-06", title: "US Fed Meeting (FOMC)", type: "global", description: "Federal Open Market Committee policy decision", impact: "high" },
  { date: "2026-06-17", title: "US Fed Meeting (FOMC)", type: "global", description: "Federal Open Market Committee policy decision", impact: "high" },
  { date: "2026-07-29", title: "US Fed Meeting (FOMC)", type: "global", description: "Federal Open Market Committee policy decision", impact: "high" },
  { date: "2026-09-16", title: "US Fed Meeting (FOMC)", type: "global", description: "Federal Open Market Committee policy decision", impact: "high" },
  { date: "2026-11-04", title: "US Fed Meeting (FOMC)", type: "global", description: "Federal Open Market Committee policy decision", impact: "high" },
  { date: "2026-12-16", title: "US Fed Meeting (FOMC)", type: "global", description: "Federal Open Market Committee policy decision", impact: "high" },
  { date: "2026-01-20", title: "US Q4 GDP (Advance)", type: "global", description: "US GDP growth rate Q4 2025", impact: "medium" },
  { date: "2026-04-29", title: "US Q1 GDP (Advance)", type: "global", description: "US GDP growth rate Q1 2026", impact: "medium" },
  { date: "2026-07-29", title: "US Q2 GDP (Advance)", type: "global", description: "US GDP growth rate Q2 2026", impact: "medium" },

  // Q4 Results Season
  { date: "2026-04-17", title: "Q4 FY26 Results Season Begins", type: "earnings", description: "Major companies start reporting Q4 FY2026 results", impact: "high" },
  { date: "2026-04-22", title: "TCS Q4 FY26 Results", type: "earnings", description: "Tata Consultancy Services quarterly results", impact: "high" },
  { date: "2026-07-11", title: "Q1 FY27 Results Season Begins", type: "earnings", description: "Major companies start reporting Q1 FY2027 results", impact: "high" },
  { date: "2026-10-10", title: "Q2 FY27 Results Season Begins", type: "earnings", description: "Major companies start reporting Q2 FY2027 results", impact: "high" },
];

const TYPE_CONFIG = {
  holiday: { label: "Market Holiday", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: Star, dot: "bg-red-500" },
  rbi: { label: "RBI / Monetary", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Building, dot: "bg-blue-500" },
  macro: { label: "Indian Macro", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: TrendingUp, dot: "bg-yellow-500" },
  global: { label: "Global Event", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: Globe, dot: "bg-purple-500" },
  earnings: { label: "Earnings", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: TrendingUp, dot: "bg-green-500" },
};

const IMPACT_COLOR = {
  high: "text-red-400",
  medium: "text-yellow-400",
  low: "text-green-400",
};

type FilterType = "all" | CalEvent["type"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function CalendarPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const today = new Date();
  const [viewYear] = useState(2026);

  const filtered = EVENTS.filter((e) => {
    if (filter !== "all" && e.type !== filter) return false;
    return e.date.startsWith(String(viewYear));
  }).sort((a, b) => a.date.localeCompare(b.date));

  // Group by month
  const byMonth: Record<number, CalEvent[]> = {};
  for (const ev of filtered) {
    const m = parseInt(ev.date.slice(5, 7)) - 1;
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(ev);
  }

  const upcoming = EVENTS.filter((e) => new Date(e.date) >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  return (
    <div className="space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          Economic Calendar
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Indian market holidays, RBI policy dates, global events & earnings season — 2026
        </p>
      </div>

      {/* Upcoming Events */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">📅 Upcoming Events</h2>
        <div className="space-y-2">
          {upcoming.map((ev, i) => {
            const cfg = TYPE_CONFIG[ev.type];
            const d = new Date(ev.date);
            const daysAway = Math.ceil((d.getTime() - today.getTime()) / 86400000);
            return (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{ev.title}</div>
                  <div className="text-xs text-muted-foreground">{ev.description}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-primary">{daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway}d away`}</div>
                  <div className="text-[10px] text-muted-foreground">{d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "holiday", "rbi", "macro", "global", "earnings"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f === "all" ? "All Events" : TYPE_CONFIG[f].label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {(Object.entries(TYPE_CONFIG) as [CalEvent["type"], (typeof TYPE_CONFIG)[CalEvent["type"]]][]).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        ))}
      </div>

      {/* Calendar by month */}
      <div className="space-y-6">
        {Object.entries(byMonth).map(([mIdx, events]) => (
          <div key={mIdx} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <h3 className="font-bold">{MONTHS[parseInt(mIdx)]} {viewYear}</h3>
            </div>
            <div className="divide-y">
              {events.map((ev, i) => {
                const cfg = TYPE_CONFIG[ev.type];
                const d = new Date(ev.date);
                const isPast = d < today;
                return (
                  <div key={i} className={`flex items-start gap-4 px-5 py-3 transition-colors hover:bg-accent/20 ${isPast ? "opacity-50" : ""}`}>
                    <div className="text-center shrink-0 w-10">
                      <div className="text-lg font-bold tabular-nums">{d.getDate()}</div>
                      <div className="text-[10px] text-muted-foreground">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{ev.title}</span>
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {ev.impact && (
                          <span className={`text-[10px] font-semibold ${IMPACT_COLOR[ev.impact]}`}>
                            {ev.impact.toUpperCase()} IMPACT
                          </span>
                        )}
                      </div>
                      {ev.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{ev.description}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
