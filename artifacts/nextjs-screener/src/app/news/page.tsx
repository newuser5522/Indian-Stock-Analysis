"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Newspaper, ExternalLink, Clock } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

interface NewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  relatedTickers?: string[];
}

const CATEGORIES = ["All", "Macro", "Earnings", "Corporate", "Regulatory", "Market"] as const;
type Category = (typeof CATEGORIES)[number];

const MACRO_KW = ["rbi","repo rate","inflation","gdp","economy","fiscal","monetary","interest rate","credit policy","forex","rupee","dollar","import","export","trade deficit","budget","government","ministry","policy","niti aayog","election","geopolit"];
const EARN_KW = ["q1","q2","q3","q4","profit","revenue","earnings","results","net income","ebitda","pat","quarterly","annual report","dividend","fy2","fy25","fy26","turnover","loss","income"];
const CORP_KW = ["merger","acquisition","deal","board","ceo","ipo","buyback","stake","shares","fundraise","joint venture","partnership","subsidiary","demerger","listing","qip","fpo","rights issue"];
const REG_KW = ["sebi","regulation","compliance","penalty","fine","nse","bse","circular","framework","guidelines","reform","tax","gst","ban","order","probe","investigation","court","tribunal"];

function classifyNews(title: string): Category {
  const t = title.toLowerCase();
  if (REG_KW.some(k => t.includes(k))) return "Regulatory";
  if (EARN_KW.some(k => t.includes(k))) return "Earnings";
  if (CORP_KW.some(k => t.includes(k))) return "Corporate";
  if (MACRO_KW.some(k => t.includes(k))) return "Macro";
  return "Market";
}

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CATEGORY_COLOR: Record<Category, string> = {
  All: "bg-primary/10 text-primary",
  Macro: "bg-purple-500/10 text-purple-400",
  Earnings: "bg-green-500/10 text-green-400",
  Corporate: "bg-blue-500/10 text-blue-400",
  Regulatory: "bg-amber-500/10 text-amber-400",
  Market: "bg-secondary/60 text-muted-foreground",
};

export default function NewsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: news = [], isLoading } = useQuery<NewsItem[]>({
    queryKey: ["market", "news"],
    queryFn: () => fetch(apiUrl("/market/news")).then(r => r.json()),
    refetchInterval: 5 * 60 * 1000,
  });

  const classified = news.map(n => ({ ...n, category: classifyNews(n.title) }));
  const filtered = activeCategory === "All" ? classified : classified.filter(n => n.category === activeCategory);

  const counts: Record<string, number> = { All: news.length };
  for (const n of classified) counts[n.category] = (counts[n.category] ?? 0) + 1;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          Market News
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Live NSE/BSE market news and updates</p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              activeCategory === cat
                ? CATEGORY_COLOR[cat]
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {cat}
            {counts[cat] ? <span className="ml-1 opacity-60">({counts[cat]})</span> : null}
          </button>
        ))}
      </div>

      {/* News list */}
      <div className="rounded-lg border bg-card divide-y overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading news…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">No news in this category</div>
        ) : (
          filtered.map(item => {
            const expanded = expandedId === item.uuid;
            return (
              <div key={item.uuid} className="p-4 hover:bg-accent/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLOR[item.category as Category]}`}>
                        {item.category}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(item.providerPublishTime)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">· {item.publisher}</span>
                    </div>
                    <button
                      className="text-sm font-medium text-left hover:text-primary transition-colors leading-snug"
                      onClick={() => setExpandedId(expanded ? null : item.uuid)}
                    >
                      {item.title}
                    </button>
                    {(item.relatedTickers ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(item.relatedTickers ?? []).slice(0, 5).map(t => (
                          <span key={t} className="rounded bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5">
                            {t.replace(/\.(NS|BO)$/i, "")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <a href={item.link} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 p-1.5 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-primary transition-colors">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
