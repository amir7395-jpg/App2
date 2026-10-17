import type { Metadata } from "next";
import "./globals.css";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: `${config.brandName} — AI calling agent for small businesses`,
  description:
    "An AI phone agent that calls and follows up your leads, books appointments on your calendar, and reminds customers about invoices more than 30 days overdue. $50/month.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
