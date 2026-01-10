import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout';

export const metadata: Metadata = {
  title: 'About - IsTheFerryRunning',
  description: 'Learn about IsTheFerryRunning, how ferry predictions work, and our mission to help travelers plan better.',
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

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24 lg:pt-32 pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <article className="max-w-3xl mx-auto">
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">About Is the Ferry Running?</h1>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">What We Do</h2>
              <p className="text-muted-foreground mb-4">
                Is the Ferry Running? helps travelers make informed decisions about ferry travel by providing delay and cancellation forecasts based on weather conditions and historical data.
              </p>
              <p className="text-muted-foreground">
                We analyze real-time weather forecasts&mdash;including wind speed, gusts, and direction&mdash;and compare them against historical sailing outcomes to estimate the likelihood that a ferry will run as scheduled.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">How It Works</h2>
              <p className="text-muted-foreground mb-4">
                Our prediction model considers multiple factors:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-2">
                <li>Current and forecasted wind conditions</li>
                <li>Historical cancellation patterns for each route</li>
                <li>Vessel type and route characteristics</li>
                <li>Time of day and seasonal patterns</li>
              </ul>
              <p className="text-muted-foreground">
                Different routes respond differently to weather. A sheltered harbor route may operate in conditions that would cause cancellations on an exposed ocean crossing.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">Important Notice</h2>
              <div className="bg-warning-muted border border-warning/30 rounded-lg p-4">
                <p className="text-warning-foreground">
                  This site is not affiliated with any ferry operator. Predictions are estimates based on weather and historical data&mdash;not official schedules or guarantees. Always verify with your ferry operator before traveling, especially during severe weather.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">Coverage</h2>
              <p className="text-muted-foreground mb-4">
                We currently cover ferry routes in the Cape Cod &amp; Islands region, including routes between:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Woods Hole and Martha&apos;s Vineyard</li>
                <li>Hyannis and Nantucket</li>
                <li>Woods Hole and Oak Bluffs</li>
              </ul>
              <p className="text-muted-foreground">
                The system is designed to scale to additional regions and operators.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">The Prediction Game</h2>
              <p className="text-muted-foreground mb-4">
                For users who want a more engaging experience, we offer an optional prediction game. Make predictions about whether ferries will sail or be canceled, earn points, and compete on leaderboards.
              </p>
              <p className="text-muted-foreground">
                The game is free to play. Points have no monetary value and cannot be exchanged for prizes or compensation.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">Contact</h2>
              <p className="text-muted-foreground">
                For questions or feedback: <a href="mailto:support@istheferryrunning.com" className="text-accent hover:underline">support@istheferryrunning.com</a>
              </p>
            </section>
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
