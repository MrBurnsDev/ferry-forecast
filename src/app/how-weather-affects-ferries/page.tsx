import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "How Weather Affects Ferry Operations and Cancellations",
  description: "Learn how wind speed, gusts, wave height, and direction affect ferry cancellations. Understanding why some routes are more weather-sensitive than others.",
  alternates: {
    canonical: "https://www.istheferryrunning.com/how-weather-affects-ferries",
  },
};

// FAQ Schema for this page
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Why do ferries get canceled due to weather?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ferry operators cancel or delay sailings when wind speeds, wave heights, or visibility fall outside safe operating parameters. Each vessel type has different thresholds based on size, hull design, and route exposure."
      }
    },
    {
      "@type": "Question",
      "name": "What wind speed causes ferry cancellations?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Cancellation thresholds vary by vessel and route. High-speed catamarans may stop running at 25-30 mph winds, while larger traditional ferries often operate safely up to 40+ mph. Direction matters as much as speed."
      }
    },
    {
      "@type": "Question",
      "name": "Are some ferry routes more affected by weather than others?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Longer, more exposed routes like Hyannis to Nantucket are more weather-sensitive than shorter, protected routes. Open water crossings face bigger waves and stronger currents than routes through protected harbors."
      }
    }
  ]
};

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function WindIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  );
}

function CompassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function ShipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 21l.5-2A2 2 0 0 1 4.4 17.5h15.2a2 2 0 0 1 1.9 1.5l.5 2" />
      <path d="M4 17V11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
      <path d="M6 9V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4" />
      <path d="M9 9V7h6v2" />
    </svg>
  );
}

export default function HowWeatherAffectsFerries() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* FAQ Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50" aria-label="Main navigation">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="nav-link">Home</Link>
              <Link href="/region/cci" className="nav-link">Cape Cod & Islands</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 lg:pt-32 pb-8 lg:pb-12 bathymetric-bg">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
              How Weather Affects Ferry Operations and Cancellations
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Ferry cancellations aren&apos;t random&mdash;they follow patterns based on weather conditions, vessel capabilities, and route characteristics. Understanding these factors helps you plan better, whether you&apos;re traveling to Martha&apos;s Vineyard, Nantucket, or any other ferry destination.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 py-8 lg:py-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">

            {/* Wind Speed */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <WindIcon className="w-8 h-8 text-accent" />
                <h2 className="text-2xl font-bold text-foreground">Wind Speed and Gusts</h2>
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <p>
                  Wind is the primary factor in ferry cancellations. Operators monitor both sustained wind speed and gusts when making decisions. A steady 20 mph wind might be manageable, but gusts to 35 mph can make docking unsafe.
                </p>
                <p>
                  Different vessels handle wind differently:
                </p>
                <ul>
                  <li><strong>High-speed catamarans</strong> are most sensitive, often suspending service at 25-30 mph winds</li>
                  <li><strong>Traditional car ferries</strong> can operate in higher winds, sometimes up to 40+ mph</li>
                  <li><strong>Smaller passenger ferries</strong> fall somewhere in between</li>
                </ul>
                <p>
                  This is why on the same route, you might see high-speed service canceled while traditional ferry service continues. When checking if the ferry is running, consider which vessel type you&apos;re booked on.
                </p>
              </div>
            </section>

            {/* Wind Direction */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <CompassIcon className="w-8 h-8 text-accent" />
                <h2 className="text-2xl font-bold text-foreground">Wind Direction Matters</h2>
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <p>
                  A 25 mph southwest wind affects a ferry differently than a 25 mph northeast wind. Direction determines:
                </p>
                <ul>
                  <li><strong>Wave height and period:</strong> Wind blowing across open water builds larger waves</li>
                  <li><strong>Docking safety:</strong> Wind pushing against the dock complicates berthing</li>
                  <li><strong>Route exposure:</strong> Some directions create crosswinds that are harder to navigate</li>
                </ul>
                <p>
                  For example, routes crossing open water like Nantucket Sound are particularly affected by southwest winds, which have a long fetch across the Atlantic. Protected routes through harbors may be more affected by northeast winds during nor&apos;easters.
                </p>
              </div>
            </section>

            {/* Route Characteristics */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <ShipIcon className="w-8 h-8 text-accent" />
                <h2 className="text-2xl font-bold text-foreground">Why Routes Respond Differently</h2>
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <p>
                  Not all ferry routes are created equal. Several factors determine how weather-sensitive a particular crossing is:
                </p>
                <ul>
                  <li><strong>Crossing distance:</strong> Longer routes spend more time in open water</li>
                  <li><strong>Water depth:</strong> Shallow water creates steeper, choppier waves</li>
                  <li><strong>Protection:</strong> Routes through sounds vs. open ocean face different conditions</li>
                  <li><strong>Harbor exposure:</strong> Some ports are more protected from certain wind directions</li>
                </ul>
                <p>
                  This explains why the Hyannis to Nantucket route (26 miles across Nantucket Sound) experiences more weather cancellations than the Woods Hole to Vineyard Haven route (7 miles across Vineyard Sound). The longer crossing has more exposure to deteriorating conditions.
                </p>
              </div>
            </section>

            {/* How We Predict */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">How Our Predictions Work</h2>
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <p>
                  Is the Ferry Running? combines current weather forecasts with historical sailing data to estimate cancellation likelihood. Our system:
                </p>
                <ul>
                  <li>Analyzes years of sailing outcomes across different weather conditions</li>
                  <li>Weights factors like wind speed, gusts, and direction for each route</li>
                  <li>Accounts for vessel type differences and seasonal patterns</li>
                  <li>Updates predictions as weather forecasts change</li>
                </ul>
                <p>
                  This approach is designed to scale across hundreds of ports and operators&mdash;the same methodology that works for Cape Cod ferries applies to ferry routes anywhere in the world.
                </p>
              </div>
            </section>

            {/* Disclaimer */}
            <section className="mb-12">
              <div className="bg-warning-muted border border-warning/30 rounded-xl p-6">
                <h3 className="font-semibold text-warning-foreground mb-2">Important Notice</h3>
                <p className="text-sm text-warning-foreground leading-relaxed">
                  This site is independent and not affiliated with any ferry operator, including the Steamship Authority, Hy-Line Cruises, or any other company. Our predictions are estimates based on historical data&mdash;always verify with your ferry operator before traveling, especially during severe weather.
                </p>
              </div>
            </section>

            {/* Internal Links */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">Check Ferry Status by Route</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                  href="/operator/ssa/corridor/woods-hole-vineyard-haven"
                  className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors"
                >
                  <span className="font-semibold text-foreground">Woods Hole ↔ Martha&apos;s Vineyard</span>
                  <p className="text-sm text-muted-foreground mt-1">Steamship Authority ferry status</p>
                </Link>
                <Link
                  href="/operator/ssa/corridor/hyannis-nantucket"
                  className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors"
                >
                  <span className="font-semibold text-foreground">Hyannis ↔ Nantucket</span>
                  <p className="text-sm text-muted-foreground mt-1">Steamship Authority ferry status</p>
                </Link>
                <Link
                  href="/operator/hyline/corridor/hyannis-nantucket"
                  className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors"
                >
                  <span className="font-semibold text-foreground">Hyannis ↔ Nantucket (High-Speed)</span>
                  <p className="text-sm text-muted-foreground mt-1">Hy-Line Cruises ferry status</p>
                </Link>
                <Link
                  href="/region/cci"
                  className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors"
                >
                  <span className="font-semibold text-foreground">All Cape Cod & Islands Routes</span>
                  <p className="text-sm text-muted-foreground mt-1">View all operators and routes</p>
                </Link>
              </div>
            </section>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 lg:py-12 bg-secondary border-t border-border/50" role="contentinfo">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <WavesIcon className="w-6 h-6 text-accent" aria-hidden="true" />
              <span className="font-semibold text-foreground">Is the Ferry Running?</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Not affiliated with any ferry operator. Schedule data from operator websites.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
