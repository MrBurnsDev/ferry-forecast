/**
 * Port Conditions Accordion
 *
 * Phase 90: Homepage SEO Enhancement
 * Phase 91: Summary-only with links to authoritative port pages
 *
 * This accordion provides SHORT SUMMARIES only.
 * Full content lives on /ports/{slug} pages.
 *
 * The accordion:
 * - Educates users about ports briefly
 * - Links to full port pages for details
 * - Does NOT duplicate full content
 * - Does NOT introduce facts not on port pages
 */

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { WeatherModal } from './WeatherModal';
import { PORT_CONTENT, type PortContent } from '@/lib/content/port-content';

// ============================================================
// ICONS
// ============================================================

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="6 9 12 15 18 9" />
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

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ThermometerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
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

// ============================================================
// TYPES FOR WEATHER MODAL COMPATIBILITY
// ============================================================

export interface PortData {
  id: string;
  slug: string;
  name: string;
  coordinates: { lat: number; lon: number };
}

// ============================================================
// ACCORDION ITEM COMPONENT
// ============================================================

interface PortAccordionItemProps {
  port: PortContent;
  isOpen: boolean;
  onToggle: () => void;
  onOpenWeather: () => void;
}

function PortAccordionItem({ port, isOpen, onToggle, onOpenWeather }: PortAccordionItemProps) {
  // Get route count for summary
  const routeCount = port.routes.length;
  const operatorNames = [...new Set(port.routes.map(r => r.operator))];

  return (
    <div className="border-b border-border/30 last:border-b-0">
      {/* Accordion Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-inset"
        aria-expanded={isOpen}
        aria-controls={`port-content-${port.slug}`}
      >
        <div className="flex items-center gap-3">
          <MapPinIcon className="w-5 h-5 text-accent flex-shrink-0" />
          <span className="font-medium text-foreground">{port.name}</span>
        </div>
        <ChevronDownIcon
          className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Accordion Content - Summary Only */}
      <div
        id={`port-content-${port.slug}`}
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="px-4 pb-4 space-y-4">
          {/* Summary Text */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {port.accordionSummary}
          </p>

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary/50 rounded-full text-xs text-muted-foreground">
              <FerryIcon className="w-3 h-3" />
              {routeCount} route{routeCount !== 1 ? 's' : ''}
            </span>
            {operatorNames.map((op) => (
              <span
                key={op}
                className="inline-flex items-center px-2.5 py-1 bg-secondary/50 rounded-full text-xs text-muted-foreground"
              >
                {op}
              </span>
            ))}
          </div>

          {/* Actions Row */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {/* Live Weather Button */}
            <button
              onClick={onOpenWeather}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-accent hover:text-accent/80 hover:bg-accent/5 rounded-lg transition-colors"
            >
              <ThermometerIcon className="w-4 h-4" />
              Current Weather
            </button>

            {/* Link to Full Port Page */}
            <Link
              href={`/ports/${port.slug}`}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:text-accent hover:bg-accent/5 rounded-lg transition-colors"
            >
              Learn More
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>

          {/* Quick Links to Operators */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
            {port.externalLinks.slice(0, 2).map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent transition-colors"
              >
                {link.label}
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN ACCORDION COMPONENT
// ============================================================

export function PortAccordion() {
  const [openPorts, setOpenPorts] = useState<Set<string>>(new Set());
  const [weatherModalPort, setWeatherModalPort] = useState<PortData | null>(null);

  // Get ports from content
  const ports = Object.values(PORT_CONTENT);

  const togglePort = useCallback((portSlug: string) => {
    setOpenPorts((prev) => {
      const next = new Set(prev);
      if (next.has(portSlug)) {
        next.delete(portSlug);
      } else {
        next.add(portSlug);
      }
      return next;
    });
  }, []);

  const openWeatherModal = useCallback((port: PortContent) => {
    setWeatherModalPort({
      id: port.slug,
      slug: port.slug,
      name: port.name,
      coordinates: port.coordinates,
    });
  }, []);

  const closeWeatherModal = useCallback(() => {
    setWeatherModalPort(null);
  }, []);

  return (
    <section className="py-8 lg:py-12" aria-labelledby="port-conditions-heading">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-6">
            <h2
              id="port-conditions-heading"
              className="text-xl lg:text-2xl font-bold text-foreground mb-2"
            >
              Port Conditions & Local Ferry Behavior
            </h2>
            <p className="text-sm text-muted-foreground">
              Each port has unique characteristics that affect ferry operations. Click to learn more.
            </p>
          </div>

          {/* Accordion Container */}
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
            {ports.map((port) => (
              <PortAccordionItem
                key={port.slug}
                port={port}
                isOpen={openPorts.has(port.slug)}
                onToggle={() => togglePort(port.slug)}
                onOpenWeather={() => openWeatherModal(port)}
              />
            ))}
          </div>

          {/* Footer Note */}
          <p className="text-xs text-muted-foreground text-center mt-4">
            For detailed weather information and traveler advice, visit the full port pages.
          </p>
        </div>
      </div>

      {/* Weather Modal */}
      {weatherModalPort && (
        <WeatherModal port={weatherModalPort} onClose={closeWeatherModal} />
      )}
    </section>
  );
}
