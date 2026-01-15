import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegionProvider } from "@/lib/region";
import { AuthProvider } from "@/lib/auth";
import { BettingProvider } from "@/lib/betting";
import { AddToHomeScreenPrompt } from "@/components/AddToHomeScreenPrompt";

const BASE_URL = 'https://www.istheferryrunning.com';

export const viewport: Viewport = {
  themeColor: '#1a365d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Is the Ferry Running? Ferry Delay & Cancellation Forecasts by Route",
    template: "%s | Is the Ferry Running?",
  },
  description: "Is the ferry running today? View ferry delay and cancellation likelihoods by route and port using weather and historical data. Built to scale across hundreds of ferry routes.",
  keywords: ["ferry status", "ferry running", "ferry cancellation", "ferry delay", "ferry forecast", "weather ferry"],
  authors: [{ name: "Is the Ferry Running?" }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Is The Ferry Running?',
  },
  formatDetection: {
    telephone: false,
  },
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
  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* PWA meta tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Is The Ferry Running?" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Splash screens for iOS */}
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512x512.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
        />
      </head>
      <body className="antialiased">
        <RegionProvider>
          <AuthProvider>
            <BettingProvider>
              {children}
              <AddToHomeScreenPrompt />
            </BettingProvider>
          </AuthProvider>
        </RegionProvider>
      </body>
    </html>
  );
}
