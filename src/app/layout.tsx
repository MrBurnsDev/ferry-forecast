import type { Metadata } from "next";
import "./globals.css";
import { RegionProvider } from "@/lib/region";

export const metadata: Metadata = {
  title: "FerryForecast - Know Before You Go",
  description: "Reliable ferry status forecasts for safer, more predictable maritime travel. Check conditions before your journey.",
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
          {children}
        </RegionProvider>
      </body>
    </html>
  );
}
