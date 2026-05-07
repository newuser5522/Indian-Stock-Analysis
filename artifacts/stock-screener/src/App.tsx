import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MarketOverview from "@/pages/market-overview";
import Screener from "@/pages/screener";
import StockDetail from "@/pages/stock-detail";
import Watchlist from "@/pages/watchlist";
import Navbar from "@/components/layout/Navbar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <Navbar />
      <main className="pt-16">
        <Switch>
          <Route path="/" component={MarketOverview} />
          <Route path="/screener" component={Screener} />
          <Route path="/stock/:symbol" component={StockDetail} />
          <Route path="/watchlist" component={Watchlist} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
