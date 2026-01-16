/**
 * XML Sitemap for istheferryrunning.com
 *
 * Phase 92: Conservative SEO Sitemap
 *
 * This sitemap includes ONLY stable, directly indexable pages.
 * It intentionally excludes dynamic routes that depend on app state.
 *
 * INCLUDED (Canonical, Evergreen):
 * - Homepage (/)
 * - Port authority pages (/ports/[slug]) - HIGH PRIORITY for SEO
 * - Static informational pages (About, Privacy, Terms)
 * - How Weather Affects Ferries (authority content)
 *
 * EXCLUDED (Intentionally):
 * - Dynamic corridor routes (require app state)
 * - Operator routes (redirect without selection)
 * - Region pages (redirect to "Please select a region")
 * - Terminal pages (not meaningful without context)
 * - Win/leaderboard pages (user-generated, ephemeral)
 * - Auth pages (not indexable)
 * - Predictions page (app-state dependent)
 * - Account page (user-specific)
 *
 * WHY THIS APPROACH:
 * - Prevents crawl waste on state-dependent pages
 * - Focuses Google on our authority content (port pages)
 * - Avoids indexing pages that show "Please select..." messaging
 * - Maintains crawl budget for pages that actually rank
 */

import { MetadataRoute } from 'next';
import { getAllPortSlugs } from '@/lib/content/port-content';

const BASE_URL = 'https://www.istheferryrunning.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // ============================================================
  // HOMEPAGE - Highest priority
  // ============================================================
  entries.push({
    url: BASE_URL,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 1.0,
  });

  // ============================================================
  // PORT AUTHORITY PAGES - High priority for SEO
  // These are canonical, statically generated, SEO authority pages
  // ============================================================
  const portSlugs = getAllPortSlugs();
  for (const slug of portSlugs) {
    entries.push({
      url: `${BASE_URL}/ports/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    });
  }

  // ============================================================
  // AUTHORITY / METHODOLOGY PAGE - High priority for SEO
  // ============================================================
  entries.push({
    url: `${BASE_URL}/how-weather-affects-ferries`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.8,
  });

  // ============================================================
  // STATIC INFORMATIONAL PAGES - Lower priority
  // ============================================================
  entries.push({
    url: `${BASE_URL}/about`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.5,
  });

  entries.push({
    url: `${BASE_URL}/privacy`,
    lastModified: new Date(),
    changeFrequency: 'yearly',
    priority: 0.3,
  });

  entries.push({
    url: `${BASE_URL}/terms`,
    lastModified: new Date(),
    changeFrequency: 'yearly',
    priority: 0.3,
  });

  return entries;
}
