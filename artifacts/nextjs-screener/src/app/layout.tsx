import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Indian Stock Screener",
  description: "NSE/BSE stock screener with fundamentals and charts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <Navbar />
          <main className="mx-auto max-w-screen-xl px-4 py-6 lg:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
