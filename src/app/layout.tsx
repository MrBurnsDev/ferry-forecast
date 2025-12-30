import type { Metadata } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
