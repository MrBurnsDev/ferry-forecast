/**
 * Port Conditions Accordion
 *
 * Phase 90: Homepage SEO Enhancement
 *
 * Expandable accordion showing local ferry behavior and conditions
 * for each port in the Cape Cod & Islands region. Each port has:
 * - Overview copy with local context
 * - Weather/wind nuances specific to that port
 * - Live weather modal trigger
 * - Relevant corridor and external links
 *
 * SSR-safe: All content is statically rendered for SEO.
 * Weather data is fetched client-side on modal open.
 */

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { WeatherModal } from './WeatherModal';

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

function WindIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
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

// ============================================================
// PORT DATA
// ============================================================

export interface PortLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface PortData {
  id: string;
  name: string;
  coordinates: { lat: number; lon: number };
  overview: string;
  windNuance: string;
  corridorLinks: PortLink[];
  externalLinks: PortLink[];
}

/**
 * Human-written content for each port
 *
 * Each entry provides:
 * - overview: General description of the port's role and character
 * - windNuance: Specific weather/wind patterns that affect ferry operations
 * - corridorLinks: Internal links to ferry route pages
 * - externalLinks: Relevant town/operator websites
 */
export const PORT_DATA: PortData[] = [
  {
    id: 'woods-hole',
    name: 'Woods Hole',
    coordinates: { lat: 41.5235, lon: -70.6724 },
    overview:
      "Woods Hole is the primary mainland departure point for Martha's Vineyard, serving as the Steamship Authority's busiest terminal. This small scientific village sits at the southwestern tip of Cape Cod, where Vineyard Sound meets Buzzards Bay. The terminal handles both passenger and vehicle ferries year-round, making it the lifeline for island residents and visitors alike.",
    windNuance:
      "Southwest winds are the biggest concern here. When winds blow from the SW at 25+ mph, the exposed terminal faces direct swells from Buzzards Bay, making docking difficult for the larger car ferries. The narrow channel between Woods Hole and the Elizabeth Islands can create strong currents during tidal changes, especially during spring tides. Winter nor'easters from the NE-E quadrant also cause significant disruptions, though the harbor offers slightly more protection from these directions.",
    corridorLinks: [
      { label: 'Woods Hole → Vineyard Haven', href: '/corridor/woods-hole-vineyard-haven' },
      { label: 'Woods Hole → Oak Bluffs', href: '/corridor/woods-hole-oak-bluffs' },
    ],
    externalLinks: [
      { label: 'Steamship Authority', href: 'https://www.steamshipauthority.com', external: true },
      { label: 'Town of Falmouth', href: 'https://www.falmouthma.gov', external: true },
    ],
  },
  {
    id: 'hyannis',
    name: 'Hyannis',
    coordinates: { lat: 41.6519, lon: -70.2834 },
    overview:
      "Hyannis serves as the gateway to Nantucket and offers seasonal high-speed service to Martha's Vineyard. Located on the south shore of Cape Cod, the Ocean Street Dock handles both Steamship Authority car ferries and Hy-Line's fast ferries. The protected inner harbor provides better shelter than more exposed terminals, though the longer crossing to Nantucket means weather conditions matter more for the journey itself.",
    windNuance:
      "South and southwest winds are the primary concern for Hyannis departures. Nantucket Sound can build significant seas during sustained S-SW winds above 20 mph, affecting the hour-long crossing. The high-speed ferries are more sensitive to wave conditions than traditional ferries—expect cancellations when seas exceed 6-8 feet. The harbor itself is relatively protected, so departure is usually possible; it's the open water conditions that determine cancellations.",
    corridorLinks: [
      { label: 'Hyannis → Nantucket', href: '/corridor/hyannis-nantucket' },
      { label: 'Hyannis → Vineyard Haven (Hy-Line)', href: '/corridor/hyannis-vineyard-haven' },
    ],
    externalLinks: [
      { label: 'Steamship Authority', href: 'https://www.steamshipauthority.com', external: true },
      { label: 'Hy-Line Cruises', href: 'https://www.hylinecruises.com', external: true },
      { label: 'Town of Barnstable', href: 'https://www.townofbarnstable.us', external: true },
    ],
  },
  {
    id: 'falmouth',
    name: 'Falmouth (Inner Harbor)',
    coordinates: { lat: 41.5416, lon: -70.6086 },
    overview:
      "Falmouth Inner Harbor is home to the Island Queen, a passenger-only ferry service to Oak Bluffs that operates seasonally from late May through mid-October. The smaller vessel and shorter crossing time make this a popular option for day-trippers who don't need their car on the Vineyard. The harbor's location provides good protection from most wind directions.",
    windNuance:
      "The Island Queen's smaller size makes it more susceptible to wave action than the larger Steamship Authority vessels. Southwest winds above 25 mph typically trigger cancellations, as the crossing enters more exposed waters around the Elizabeth Islands. However, the short 35-minute crossing means weather windows are easier to navigate than longer routes. Morning fog in summer can occasionally delay early departures.",
    corridorLinks: [
      { label: 'View Oak Bluffs arrivals', href: '/corridor/woods-hole-oak-bluffs' },
    ],
    externalLinks: [
      { label: 'Island Queen Ferry', href: 'https://islandqueen.com', external: true },
      { label: 'Town of Falmouth', href: 'https://www.falmouthma.gov', external: true },
    ],
  },
  {
    id: 'vineyard-haven',
    name: 'Vineyard Haven',
    coordinates: { lat: 41.4532, lon: -70.6024 },
    overview:
      "Vineyard Haven is Martha's Vineyard's year-round ferry terminal and the island's commercial center. All Steamship Authority car ferries from Woods Hole dock here, along with Hy-Line's seasonal service from Hyannis. The harbor sits in a natural inlet on the island's northeastern shore, providing reasonable protection from prevailing winds while remaining accessible in most conditions.",
    windNuance:
      "Northeast winds pose the greatest challenge at Vineyard Haven. Strong NE-E winds (25+ mph) blow directly into the harbor entrance, creating difficult conditions for docking the large car ferries. The approach requires precise maneuvering through a relatively narrow channel, and captains may opt to skip Vineyard Haven in favor of Oak Bluffs when NE swells are significant. Southwest winds rarely cause issues here due to the island's protective lee.",
    corridorLinks: [
      { label: 'Woods Hole → Vineyard Haven', href: '/corridor/woods-hole-vineyard-haven' },
      { label: 'Hyannis → Vineyard Haven (Hy-Line)', href: '/corridor/hyannis-vineyard-haven' },
    ],
    externalLinks: [
      { label: 'Steamship Authority', href: 'https://www.steamshipauthority.com', external: true },
      { label: 'Town of Tisbury', href: 'https://www.tisburyma.gov', external: true },
    ],
  },
  {
    id: 'oak-bluffs',
    name: 'Oak Bluffs',
    coordinates: { lat: 41.456, lon: -70.5583 },
    overview:
      "Oak Bluffs serves as Martha's Vineyard's seasonal ferry hub, with service from both Woods Hole (Steamship Authority) and Falmouth (Island Queen). The harbor is a man-made breakwater protected basin on the island's eastern shore. Famous for its Victorian gingerbread cottages and lively summer scene, Oak Bluffs sees heavy ferry traffic from Memorial Day through Labor Day.",
    windNuance:
      "East and southeast winds are problematic at Oak Bluffs. The artificial breakwater offers good protection from the north and west, but E-SE winds blow directly into the harbor entrance. During strong easterlies (20+ mph), ferries may divert to Vineyard Haven instead. The relatively shallow approach can also create choppy conditions that make the large SSA ferries uncomfortable, though cancellation is less common than diversion.",
    corridorLinks: [
      { label: 'Woods Hole → Oak Bluffs', href: '/corridor/woods-hole-oak-bluffs' },
    ],
    externalLinks: [
      { label: 'Steamship Authority', href: 'https://www.steamshipauthority.com', external: true },
      { label: 'Island Queen Ferry', href: 'https://islandqueen.com', external: true },
      { label: 'Town of Oak Bluffs', href: 'https://www.oakbluffsma.gov', external: true },
    ],
  },
  {
    id: 'nantucket',
    name: 'Nantucket',
    coordinates: { lat: 41.2858, lon: -70.0972 },
    overview:
      "Nantucket's Steamboat Wharf is the island's sole ferry connection to the mainland, located in the heart of Nantucket Town's historic district. Both traditional and high-speed ferries from Hyannis dock here, serving as the primary link for the island's residents, visitors, and all cargo. The 26-mile crossing—the longest in the region—makes this route particularly weather-sensitive.",
    windNuance:
      "The long open-water crossing to Nantucket is more affected by wind and wave conditions than shorter routes. Sustained winds above 25 mph from any direction can create challenging seas in Nantucket Sound. The high-speed ferries are typically canceled before the traditional ferries due to their greater sensitivity to wave action. The harbor itself is well-protected, but the 2+ hour traditional ferry crossing or 1-hour fast ferry crossing means conditions can change significantly during transit.",
    corridorLinks: [
      { label: 'Hyannis → Nantucket', href: '/corridor/hyannis-nantucket' },
    ],
    externalLinks: [
      { label: 'Steamship Authority', href: 'https://www.steamshipauthority.com', external: true },
      { label: 'Hy-Line Cruises', href: 'https://www.hylinecruises.com', external: true },
      { label: 'Town of Nantucket', href: 'https://www.nantucket-ma.gov', external: true },
    ],
  },
];

// ============================================================
// ACCORDION COMPONENTS
// ============================================================

interface PortAccordionItemProps {
  port: PortData;
  isOpen: boolean;
  onToggle: () => void;
  onOpenWeather: () => void;
}

function PortAccordionItem({ port, isOpen, onToggle, onOpenWeather }: PortAccordionItemProps) {
  return (
    <div className="border-b border-border/30 last:border-b-0">
      {/* Accordion Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-inset"
        aria-expanded={isOpen}
        aria-controls={`port-content-${port.id}`}
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

      {/* Accordion Content */}
      <div
        id={`port-content-${port.id}`}
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="px-4 pb-4 space-y-4">
          {/* Overview */}
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed">{port.overview}</p>
          </div>

          {/* Wind Nuance Section */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="flex items-start gap-2 mb-2">
              <WindIcon className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <h4 className="text-sm font-medium text-foreground">Wind & Weather Patterns</h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{port.windNuance}</p>
          </div>

          {/* Live Weather Button */}
          <button
            onClick={onOpenWeather}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-accent hover:text-accent/80 hover:bg-accent/5 rounded-lg transition-colors"
          >
            <ThermometerIcon className="w-4 h-4" />
            View Current Conditions
          </button>

          {/* Links Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* Corridor Links */}
            {port.corridorLinks.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Ferry Routes
                </h5>
                <div className="space-y-1">
                  {port.corridorLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block text-sm text-foreground hover:text-accent transition-colors py-1"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* External Links */}
            {port.externalLinks.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Resources
                </h5>
                <div className="space-y-1">
                  {port.externalLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-foreground hover:text-accent transition-colors py-1"
                    >
                      {link.label}
                      <ExternalLinkIcon className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
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

  const togglePort = useCallback((portId: string) => {
    setOpenPorts((prev) => {
      const next = new Set(prev);
      if (next.has(portId)) {
        next.delete(portId);
      } else {
        next.add(portId);
      }
      return next;
    });
  }, []);

  const openWeatherModal = useCallback((port: PortData) => {
    setWeatherModalPort(port);
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
            {PORT_DATA.map((port) => (
              <PortAccordionItem
                key={port.id}
                port={port}
                isOpen={openPorts.has(port.id)}
                onToggle={() => togglePort(port.id)}
                onOpenWeather={() => openWeatherModal(port)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Weather Modal */}
      {weatherModalPort && (
        <WeatherModal port={weatherModalPort} onClose={closeWeatherModal} />
      )}
    </section>
  );
}
