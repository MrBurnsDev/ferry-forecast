/**
 * Port Detail Page
 *
 * Phase 91: Authoritative Port SEO Pages
 *
 * Server-rendered, SEO-optimized pages for each ferry port.
 * Content follows No-Guessing Rules strictly.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteFooter, MobileMenu } from '@/components/layout';
import { getPortContent, getAllPortSlugs, type PortContent } from '@/lib/content/port-content';

// ============================================================
// STATIC GENERATION
// ============================================================

export async function generateStaticParams() {
  const slugs = getAllPortSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const port = getPortContent(slug);

  if (!port) {
    return {
      title: 'Port Not Found',
    };
  }

  return {
    title: port.seo.title,
    description: port.seo.description,
    alternates: {
      canonical: `https://www.istheferryrunning.com/ports/${port.slug}`,
    },
  };
}

// ============================================================
// ICONS
// ============================================================

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
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

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function FerryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.5-7L4 14a11.6 11.6 0 0 0 1.62 6" />
      <path d="M12 4v3" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

// ============================================================
// FAQ SCHEMA
// ============================================================

function generateFAQSchema(port: PortContent) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: port.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

// ============================================================
// PAGE COMPONENT
// ============================================================

export default async function PortPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const port = getPortContent(slug);

  if (!port) {
    notFound();
  }

  const faqSchema = generateFAQSchema(port);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50 fixed-nav-safe">
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

      {/* Main Content */}
      <main className="flex-1 pt-24 lg:pt-32 pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl mx-auto">
            {/* Breadcrumb */}
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Back to Home
            </Link>

            {/* Header */}
            <header className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <MapPinIcon className="w-8 h-8 text-accent" />
                <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                  {port.name}
                </h1>
              </div>
              <p className="text-lg text-muted-foreground">
                {port.fullName}
              </p>
            </header>

            {/* Overview Section */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Overview</h2>
              <p className="text-muted-foreground leading-relaxed">{port.overview}</p>
            </section>

            {/* Seasonal Role */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Seasonal Service</h2>
              <p className="text-muted-foreground leading-relaxed">{port.seasonalRole}</p>
            </section>

            {/* Weather Impact Section */}
            <section className="mb-8">
              <div className="bg-secondary/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <WindIcon className="w-6 h-6 text-accent" />
                  <h2 className="text-xl font-semibold text-foreground">
                    How Weather Affects Departures Here
                  </h2>
                </div>
                <div className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {port.weatherImpact}
                </div>
              </div>
            </section>

            {/* Common Reasons Section */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircleIcon className="w-6 h-6 text-accent" />
                <h2 className="text-xl font-semibold text-foreground">
                  Common Reasons Sailings Change
                </h2>
              </div>
              <ul className="space-y-2">
                {port.commonReasons.map((reason, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                    <span className="text-muted-foreground">{reason}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Traveler Advice */}
            <section className="mb-8">
              <div className="bg-warning-muted border border-warning/30 rounded-xl p-6">
                <div className="flex items-start gap-3">
                  <InfoIcon className="w-6 h-6 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-lg font-semibold text-warning-foreground mb-2">
                      What Travelers Should Know
                    </h2>
                    <p className="text-sm text-warning-foreground/90 leading-relaxed">
                      {port.travelerAdvice}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Ferry Routes */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FerryIcon className="w-6 h-6 text-accent" />
                <h2 className="text-xl font-semibold text-foreground">Ferry Connections</h2>
              </div>
              <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
                <ul className="divide-y divide-border/30">
                  {port.routes.map((route, index) => (
                    <li key={index} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-foreground">{route.route}</p>
                          <p className="text-sm text-muted-foreground">{route.operator}</p>
                          {route.seasonal && (
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              {route.seasonal}
                            </p>
                          )}
                        </div>
                        <a
                          href={route.operatorUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-accent hover:text-accent/80 flex items-center gap-1"
                        >
                          Check Status
                          <ExternalLinkIcon className="w-3 h-3" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* External Resources */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">Resources</h2>
              <div className="grid gap-3">
                {port.externalLinks.map((link, index) => (
                  <a
                    key={index}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-card border border-border/50 rounded-lg hover:border-accent/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-foreground">{link.label}</p>
                      <p className="text-sm text-muted-foreground">{link.description}</p>
                    </div>
                    <ExternalLinkIcon className="w-4 h-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </section>

            {/* FAQ Section */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                Frequently Asked Questions
              </h2>
              <div className="space-y-4">
                {port.faqs.map((faq, index) => (
                  <div
                    key={index}
                    className="bg-card border border-border/50 rounded-xl p-5"
                  >
                    <h3 className="font-medium text-foreground mb-2">{faq.question}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Disclaimer */}
            <section className="text-center">
              <p className="text-xs text-muted-foreground">
                This page provides general information about ferry service at {port.name}.
                Always verify current schedules and service status directly with ferry operators
                before traveling.
              </p>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
