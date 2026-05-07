import { Link } from "wouter";
import { AlertCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-4xl font-bold font-mono">404</h1>
        <p className="text-muted-foreground max-w-sm">
          This page doesn't exist. You may have followed a broken link or mistyped the address.
        </p>
      </div>
      <Button asChild>
        <Link href="/">
          <Home className="mr-2 h-4 w-4" />
          Back to Market
        </Link>
      </Button>
    </div>
  );
}
