import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteFooter, MobileMenu } from '@/components/layout';

// Homepage-specific metadata
export const metadata: Metadata = {
  title: "Is the Ferry Running? Ferry Delay & Cancellation Forecasts by Route",
  description: "Is the ferry running today? View ferry delay and cancellation likelihoods for Martha's Vineyard, Nantucket, Hyannis, Woods Hole, and Oak Bluffs using weather and historical data.",
  alternates: {
    canonical: "https://www.istheferryrunning.com",
  },
};

// FAQ Schema for structured data
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is the ferry running today?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ferry operations depend on weather and marine conditions. This site estimates likelihood based on historical data and current weather forecasts. It is not an official schedule—always verify with your ferry operator before traveling."
      }
    },
    {
      "@type": "Question",
      "name": "Is this an official ferry operator site?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. This site is independent and analyzes historical outcomes across ferry routes and operators. We are not affiliated with any ferry company, including the Steamship Authority, Hy-Line Cruises, or any other operator."
      }
    },
    {
      "@type": "Question",
      "name": "How are ferry cancellation predictions made?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Predictions combine current weather forecasts (wind speed, gusts, direction) with historical sailing data to estimate the likelihood a ferry will run. Different routes and vessel types respond differently to weather conditions."
      }
    },
    {
      "@type": "Question",
      "name": "Which ferry routes are covered?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We currently cover ferry routes in the Cape Cod & Islands region, including Woods Hole, Vineyard Haven, Oak Bluffs, Hyannis, and Nantucket. The system is designed to scale to hundreds of ports and operators."
      }
    }
  ]
};

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

const regions = [
  { id: 'cci', name: 'Cape Cod & Islands', description: 'Martha\'s Vineyard & Nantucket' },
  // Future regions will be added here as support expands
  // { id: 'pug', name: 'Puget Sound', description: 'Washington State Ferries' },
  // { id: 'sfb', name: 'San Francisco Bay', description: 'Golden Gate & Blue & Gold' },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* FAQ Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50" aria-label="Main navigation">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
            <MobileMenu />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 lg:pt-32 pb-8 lg:pb-12 bathymetric-bg overflow-hidden">
        <div className="container mx-auto px-4 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Is the Ferry Running Today?
            </h1>

            <p className="text-lg lg:text-xl text-muted-foreground mb-2 leading-relaxed">
              Is the ferry running? Check delay and cancellation likelihoods for ferry routes across multiple ports and operators. Our predictions combine real-time weather data with historical sailing outcomes to help you plan ahead&mdash;whether you&apos;re traveling to Martha&apos;s Vineyard, Nantucket, or other ferry destinations.
            </p>
            <p className="text-base text-muted-foreground/80 italic mb-4">
              Not official schedules. Not guarantees. Just better expectations.
            </p>
          </div>
        </div>
      </section>

      {/* PRIMARY: Region Selection */}
      <section id="main-content" className="py-8 lg:py-12" aria-label="Select Region">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
                Select Your Region
              </h2>
              <p className="text-muted-foreground">
                Choose a region to view terminals, routes, and operator status
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {regions.map((region) => (
                <Link
                  key={region.id}
                  href={`/region/${region.id}`}
                  className="group p-6 rounded-xl bg-card border border-border/30 hover:border-accent hover:shadow-card transition-all duration-300"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-accent/10">
                      <MapPinIcon className="w-6 h-6 text-primary group-hover:text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                        {region.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {region.description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What You'll See */}
      <section className="py-12 lg:py-16 bg-secondary/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl lg:text-2xl font-bold text-foreground mb-8 text-center">
              What You&apos;ll See
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-start gap-4 p-5 bg-card rounded-lg">
                <ClockIcon className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Today&apos;s Schedule</h3>
                  <p className="text-sm text-muted-foreground">
                    All sailings from your terminal, ordered by departure time
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-5 bg-card rounded-lg">
                <CheckCircleIcon className="w-6 h-6 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Operator Status</h3>
                  <p className="text-sm text-muted-foreground">
                    Running, delayed, or canceled - direct from the operator
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-5 bg-card rounded-lg">
                <AlertTriangleIcon className="w-6 h-6 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Travel Advisories</h3>
                  <p className="text-sm text-muted-foreground">
                    Weather alerts and service announcements
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Learn More - Internal Linking */}
      <section className="py-8 lg:py-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-muted-foreground">
              Want to understand why ferries get canceled?{' '}
              <Link href="/how-weather-affects-ferries" className="text-accent hover:underline">
                Learn how weather affects ferry operations
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Important Notice */}
      <section className="py-8 lg:py-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-warning-muted border border-warning/30 rounded-xl p-6">
              <p className="text-sm text-warning-foreground leading-relaxed">
                <strong>Important:</strong> This site is not affiliated with any ferry operator.
                Predictions are estimates based on weather and historical data. Always verify with
                the operator before traveling, especially during severe weather.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter className="mt-auto" />
    </div>
  );
}
