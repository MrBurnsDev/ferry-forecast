import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, MobileMenu } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Privacy Policy - IsTheFerryRunning',
  description: 'How IsTheFerryRunning collects, uses, and protects user information.',
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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
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

      <main className="flex-1 pt-24 lg:pt-32 pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <article className="max-w-3xl mx-auto prose prose-invert">
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">Privacy Policy</h1>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">1. Overview</h2>
              <p className="text-muted-foreground mb-4">
                IsTheFerryRunning.com is an informational service that provides ferry schedules, travel conditions, and an optional, free-to-use prediction game. We respect user privacy and collect only the minimum information required to operate the service.
              </p>
              <p className="text-muted-foreground">
                This Privacy Policy explains what information we collect, how we use it, and the choices available to you.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">2. Information We Collect</h2>
              <p className="text-muted-foreground mb-4">
                We collect the following information when you choose to create an account:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Account identifier</li>
                <li>Email address (via Google Sign-In)</li>
                <li>Display name and profile image (if provided by the authentication provider)</li>
                <li>Prediction game activity, including points, rankings, and achievements</li>
              </ul>
              <p className="text-muted-foreground mb-4">We do not collect:</p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Payment information</li>
                <li>Financial data</li>
                <li>Government-issued identification</li>
                <li>Precise location data</li>
              </ul>
              <p className="text-muted-foreground">
                Using the site without signing in does not require providing personal information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">3. How We Use Information</h2>
              <p className="text-muted-foreground mb-4">Information is used solely to:</p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Authenticate users</li>
                <li>Maintain account access</li>
                <li>Track participation in the prediction game</li>
                <li>Display leaderboards and achievements</li>
                <li>Prevent abuse or misuse of the service</li>
                <li>Improve site functionality and reliability</li>
              </ul>
              <p className="text-muted-foreground">
                Points and achievements have no monetary value and are used for entertainment purposes only.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">4. Authentication Providers</h2>
              <p className="text-muted-foreground mb-4">
                We use third-party authentication providers to securely manage sign-in:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Google OAuth</li>
              </ul>
              <p className="text-muted-foreground">
                Authentication providers may share basic profile information as part of the login process. We do not receive your password and cannot access your Google account beyond what you authorize.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">5. Cookies and Local Storage</h2>
              <p className="text-muted-foreground mb-4">We use cookies and browser storage for:</p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Session management</li>
                <li>Authentication state</li>
                <li>Basic functionality and preferences</li>
              </ul>
              <p className="text-muted-foreground">
                We do not use cookies for advertising or cross-site tracking.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. Data Sharing</h2>
              <p className="text-muted-foreground mb-4">
                We do not sell, rent, or trade user data.
              </p>
              <p className="text-muted-foreground mb-4">
                Data is shared only with infrastructure providers necessary to operate the service, including:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Supabase</li>
              </ul>
              <p className="text-muted-foreground">
                These providers process data on our behalf and are required to protect it.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. Data Retention</h2>
              <p className="text-muted-foreground mb-4">
                We retain account data only for as long as your account remains active.
              </p>
              <p className="text-muted-foreground">
                You may request deletion of your account and associated data at any time.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. User Rights and Choices</h2>
              <p className="text-muted-foreground mb-4">You may:</p>
              <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-1">
                <li>Access your account information</li>
                <li>Delete your account</li>
                <li>Request removal of your data</li>
              </ul>
              <p className="text-muted-foreground">
                Requests can be made by contacting us at the email listed below.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Children&apos;s Privacy</h2>
              <p className="text-muted-foreground">
                The service is intended for users aged 13 and older. We do not knowingly collect information from children under 13.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">10. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy as the service evolves. Material changes will be reflected on this page.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">11. Contact Information</h2>
              <p className="text-muted-foreground mb-4">
                For questions or requests regarding this Privacy Policy:
              </p>
              <p className="text-muted-foreground">
                Email: support@istheferryrunning.com
              </p>
            </section>
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
