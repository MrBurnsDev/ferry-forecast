import { RouteSelector } from '@/components/RouteSelector';
import Link from 'next/link';

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function CompassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" />
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

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

const features = [
  {
    icon: ShieldIcon,
    title: 'Sailing Schedules',
    description: 'See today\'s scheduled sailings for your route, with operator-reported status when available.',
  },
  {
    icon: CompassIcon,
    title: 'Weather Risk Context',
    description: 'Understand how current weather conditions may affect ferry reliability - without predicting specific cancellations.',
  },
  {
    icon: ClockIcon,
    title: 'Clear Information',
    description: 'We separate what\'s scheduled from what\'s risky. You decide when conditions feel right to travel.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
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
              <span className="text-xl font-bold text-foreground">Ferry Forecast</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="nav-link active">Home</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 lg:pt-32 pb-16 lg:pb-24 bathymetric-bg overflow-hidden">
        <div className="container mx-auto px-4 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border/50 mb-6">
              <WavesIcon className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-muted-foreground">Maritime Travel Status</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Know Before You Go
            </h1>

            <p className="text-lg lg:text-xl text-muted-foreground mb-8 leading-relaxed">
              View today&apos;s sailings and understand weather-related disruption risk for Cape Cod ferry routes.
            </p>
          </div>
        </div>
      </section>

      {/* Route Selector Section */}
      <section id="main-content" className="py-12 lg:py-16 bg-coastal" aria-label="Route Selection">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <RouteSelector />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-3">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              We combine multiple data sources to predict ferry disruption risk.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="text-center lg:text-left p-8 rounded-2xl bg-card border border-border/30 hover:border-border hover:shadow-card transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center mb-5 mx-auto lg:mx-0">
                  <feature.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What This Tool Does NOT Do */}
      <section className="py-12 lg:py-16 bg-secondary/30">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl lg:text-2xl font-bold text-foreground mb-6 text-center">
              What This Tool Does NOT Do
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-4 bg-card rounded-lg">
                <span className="text-muted-foreground text-lg" aria-hidden="true">-</span>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Not a schedule.</strong> We do not show ferry departure times or booking availability.
                </p>
              </div>
              <div className="flex items-start gap-3 p-4 bg-card rounded-lg">
                <span className="text-muted-foreground text-lg" aria-hidden="true">-</span>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Not official status.</strong> Always verify with the ferry operator before traveling.
                </p>
              </div>
              <div className="flex items-start gap-3 p-4 bg-card rounded-lg">
                <span className="text-muted-foreground text-lg" aria-hidden="true">-</span>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Not a guarantee.</strong> Predictions show risk, not certainty. Ferries may run or cancel regardless.
                </p>
              </div>
              <div className="flex items-start gap-3 p-4 bg-card rounded-lg">
                <span className="text-muted-foreground text-lg" aria-hidden="true">-</span>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Not authoritative.</strong> This is an advisory tool for planning, not a replacement for operator announcements.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer Section */}
      <section className="py-8 lg:py-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-warning-muted border border-warning/30 rounded-xl p-6">
              <p className="text-sm text-warning-foreground leading-relaxed">
                <strong>Important:</strong> This is a prediction tool, not an official
                source. Always check with your ferry operator for confirmed schedules
                and cancellations. We show the <em>risk of disruption</em> based on
                weather conditions, not definitive outcomes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-8 lg:py-12 bg-secondary border-t border-border/50" role="contentinfo">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <WavesIcon className="w-6 h-6 text-accent" aria-hidden="true" />
              <span className="font-semibold text-foreground">Ferry Forecast</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Not affiliated with any ferry operator. Data: NOAA Marine Forecast, NWS Advisories, NOAA CO-OPS Tides
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
