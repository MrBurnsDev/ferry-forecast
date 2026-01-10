import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service - IsTheFerryRunning',
  description: 'Terms governing the use of IsTheFerryRunning and its prediction features.',
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

export default function TermsPage() {
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
          <article className="max-w-3xl mx-auto prose prose-invert">
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">Terms of Service</h1>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By accessing or using IsTheFerryRunning.com, you agree to these Terms of Service. If you do not agree, do not use the service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">2. Description of Service</h2>
              <p className="text-muted-foreground mb-4">
                IsTheFerryRunning.com provides ferry schedule information, operational updates, and an optional prediction-based game for entertainment purposes.
              </p>
              <p className="text-muted-foreground">
                The service may change over time as features are added or removed.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">3. The Prediction Game</h2>
              <p className="text-muted-foreground mb-4">
                The prediction game allows users to make predictions using points. Participation is optional and free.
              </p>
              <p className="text-muted-foreground">
                The game is designed for entertainment and engagement only.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">4. No Monetary Value</h2>
              <p className="text-muted-foreground mb-4">Points, rankings, crowns, or achievements:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Have no cash value</li>
                <li>Are not redeemable</li>
                <li>Do not represent real currency</li>
                <li>Cannot be exchanged for prizes or compensation</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">5. User Accounts</h2>
              <p className="text-muted-foreground mb-4">
                Accounts may be created using supported sign-in providers. You are responsible for maintaining access to your account.
              </p>
              <p className="text-muted-foreground">
                We reserve the right to suspend or remove accounts that violate these terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. Acceptable Use</h2>
              <p className="text-muted-foreground mb-4">You agree not to:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Abuse or exploit the service</li>
                <li>Attempt to manipulate leaderboards or game mechanics</li>
                <li>Interfere with system operation</li>
                <li>Use the service for unlawful purposes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. Service Availability</h2>
              <p className="text-muted-foreground mb-4">
                The service is provided &quot;as is&quot; and may be unavailable at times due to maintenance, outages, or external factors.
              </p>
              <p className="text-muted-foreground">
                We do not guarantee accuracy of schedules or predictions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. Termination</h2>
              <p className="text-muted-foreground">
                We may terminate or suspend access at any time for violations of these Terms or misuse of the service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Limitation of Liability</h2>
              <p className="text-muted-foreground mb-4">IsTheFerryRunning.com is not responsible for:</p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Travel delays</li>
                <li>Missed connections</li>
                <li>Decisions made based on site information</li>
                <li>Loss of points or rankings</li>
              </ul>
              <p className="text-muted-foreground">
                Use of the service is at your own risk.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">10. Changes to Terms</h2>
              <p className="text-muted-foreground">
                These Terms may be updated periodically. Continued use of the service constitutes acceptance of updated terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">11. Governing Law</h2>
              <p className="text-muted-foreground">
                These Terms are governed by the laws of the United States.
              </p>
            </section>
          </article>
        </div>
      </main>

      <footer className="py-8 bg-secondary border-t border-border/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              <WavesIcon className="w-6 h-6 text-accent" />
              <span className="font-semibold text-foreground">Is the Ferry Running?</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
