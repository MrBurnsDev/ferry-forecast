import type { Metadata } from "next";
import "./globals.css";
import { RegionProvider } from "@/lib/region";
import { BettingProvider } from "@/lib/betting";

const BASE_URL = 'https://www.istheferryrunning.com';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Is the Ferry Running? Ferry Delay & Cancellation Forecasts by Route",
    template: "%s | Is the Ferry Running?",
  },
  description: "Is the ferry running today? View ferry delay and cancellation likelihoods by route and port using weather and historical data. Built to scale across hundreds of ferry routes.",
  keywords: ["ferry status", "ferry running", "ferry cancellation", "ferry delay", "ferry forecast", "weather ferry"],
  authors: [{ name: "Is the Ferry Running?" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "Is the Ferry Running?",
    title: "Is the Ferry Running? Ferry Delay & Cancellation Forecasts",
    description: "Is the ferry running today? View ferry delay and cancellation likelihoods by route and port using weather and historical data.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Is the Ferry Running?",
    description: "Ferry delay and cancellation forecasts by route",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <RegionProvider>
          <BettingProvider>
            {children}
          </BettingProvider>
        </RegionProvider>
      </body>
    </html>
  );
}
