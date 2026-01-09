/**
 * XML Sitemap for istheferryrunning.com
 *
 * Generates a standards-compliant sitemap for Google Search Console.
 * Uses Next.js App Router sitemap conventions.
 *
 * INCLUDED ROUTES:
 * - Homepage (/)
 * - Region pages (/region/[regionId])
 * - Operator pages (/operator/[operatorId])
 * - Operator corridor pages (/operator/[operatorId]/corridor/[corridorId])
 * - Corridor pages (/corridor/[corridorId])
 * - Terminal pages (/terminal/[terminalId])
 *
 * EXCLUDED:
 * - API routes
 * - Admin/auth routes (none exist)
 * - Route-specific pages (legacy, redirected to corridors)
 */

import { MetadataRoute } from 'next';
import { CORRIDORS } from '@/lib/config/corridors';
import { TERMINALS } from '@/lib/config/terminals';
import { VALID_REGION_IDS } from '@/lib/region/state';

const BASE_URL = 'https://istheferryrunning.com';

// Operator URL slugs (used in URL paths)
const OPERATORS = [
  { slug: 'ssa', name: 'The Steamship Authority' },
  { slug: 'hyline', name: 'Hy-Line Cruises' },
];

// Map operator slugs to their supported corridor IDs
const OPERATOR_CORRIDORS: Record<string, string[]> = {
  ssa: [
    'woods-hole-vineyard-haven',
    'woods-hole-oak-bluffs',
    'hyannis-nantucket',
  ],
  hyline: [
    'hyannis-nantucket',
    'hyannis-vineyard-haven',
  ],
};

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // ============================================================
  // HOMEPAGE - Highest priority
  // ============================================================
  entries.push({
    url: BASE_URL,
    lastModified: new Date(),
    changeFrequency: 'hourly',
    priority: 1.0,
  });

  // ============================================================
  // REGION PAGES - High priority entry points
  // ============================================================
  for (const regionId of VALID_REGION_IDS) {
    entries.push({
      url: `${BASE_URL}/region/${regionId}`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    });
  }

  // ============================================================
  // OPERATOR PAGES - High priority
  // ============================================================
  for (const operator of OPERATORS) {
    entries.push({
      url: `${BASE_URL}/operator/${operator.slug}`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    });

    // Operator-specific corridor pages (main user journey)
    const corridorIds = OPERATOR_CORRIDORS[operator.slug] || [];
    for (const corridorId of corridorIds) {
      entries.push({
        url: `${BASE_URL}/operator/${operator.slug}/corridor/${corridorId}`,
        lastModified: new Date(),
        changeFrequency: 'hourly',
        priority: 0.85,
      });
    }
  }

  // ============================================================
  // CORRIDOR PAGES - High priority (Today's sailings)
  // ============================================================
  for (const corridor of CORRIDORS) {
    if (!corridor.active) continue;

    entries.push({
      url: `${BASE_URL}/corridor/${corridor.id}`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.8,
    });
  }

  // ============================================================
  // TERMINAL PAGES - Medium priority
  // ============================================================
  for (const terminal of TERMINALS) {
    entries.push({
      url: `${BASE_URL}/terminal/${terminal.id}`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.7,
    });
  }

  return entries;
}
