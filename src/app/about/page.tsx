import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout';

export const metadata: Metadata = {
  title: 'About - Is the Ferry Running?',
  description: 'Why IsTheFerryRunning exists and how it helps travelers plan ferry-dependent travel.',
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
              <h2 className="text-xl font-semibold text-foreground mb-4">Why This Exists</h2>
              <p className="text-muted-foreground mb-4">
                Living on an island means your schedule is only as reliable as the boat.
              </p>
              <p className="text-muted-foreground mb-4">
                For islanders, commuters, and visitors, the question &ldquo;Is the ferry running?&rdquo; affects work, school, medical appointments, family plans, and travel logistics. Yet despite how critical this question is, there has never been a clear, data-driven way to understand the likelihood of a ferry actually sailing when weather conditions are uncertain.
              </p>
              <p className="text-muted-foreground">
                IsTheFerryRunning was built to help answer that gap.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">What This Site Does</h2>
              <p className="text-muted-foreground mb-4">
                IsTheFerryRunning analyzes historical ferry outcomes alongside weather conditions such as wind speed, gusts, wave height, and direction. By looking at how ferries have operated under similar conditions in the past, the site provides a probabilistic forecast of whether sailings are likely to run.
              </p>
              <p className="text-muted-foreground mb-4">
                This is not a schedule and not an official status feed.
              </p>
              <p className="text-muted-foreground mb-4">
                It is a planning tool designed to help travelers form realistic expectations before making decisions.
              </p>
              <p className="text-muted-foreground italic">
                It&apos;s not AI.<br />
                It&apos;s math.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">Who It&apos;s For</h2>
              <p className="text-muted-foreground mb-4">
                This site is built for:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-2">
                <li>Islanders planning daily life around ferry access</li>
                <li>Off-island commuters trying to avoid unnecessary overnight stays</li>
                <li>Visitors deciding when to arrive or leave</li>
                <li>Anyone who has ever had to choose between leaving early or &ldquo;chancing it&rdquo;</li>
              </ul>
              <p className="text-muted-foreground">
                While the site currently emphasizes high-traffic routes such as Martha&apos;s Vineyard and Nantucket, the underlying system is designed to support hundreds of ferry routes and terminals over time.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">Independence &amp; Transparency</h2>
              <p className="text-muted-foreground mb-4">
                IsTheFerryRunning is an independent project.
              </p>
              <p className="text-muted-foreground mb-4">
                It is not affiliated with the Steamship Authority or any ferry operator. Operators cannot publish predictions about cancellations for valid operational reasons, and this site does not attempt to override or criticize those decisions.
              </p>
              <p className="text-muted-foreground">
                Instead, it provides historical context so travelers can make better-informed personal choices.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">The Prediction Game</h2>
              <p className="text-muted-foreground mb-4">
                The site also includes an optional, free prediction game.
              </p>
              <p className="text-muted-foreground mb-4">
                Users can choose to make predictions using points on whether sailings will run. These points have no monetary value, cannot be redeemed, and exist purely for engagement and comparison.
              </p>
              <p className="text-muted-foreground">
                The game is opt-in and separate from the core informational function of the site.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">The Goal</h2>
              <p className="text-muted-foreground mb-4">
                The goal of IsTheFerryRunning is simple:
              </p>
              <p className="text-muted-foreground mb-4">
                To help people plan their lives around ferry-dependent travel with less stress, fewer surprises, and better expectations.
              </p>
              <p className="text-muted-foreground">
                This project was built by someone who grew up on an island, is raising a family on an island, and understands how much a single canceled boat can affect an entire day.
              </p>
            </section>
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
