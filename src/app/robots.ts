/**
 * Robots.txt for istheferryrunning.com
 *
 * Guides search engine crawlers on which pages to index.
 * Uses Next.js App Router robots conventions.
 *
 * ALLOWED:
 * - All public pages (homepage, regions, operators, corridors, terminals)
 *
 * DISALLOWED:
 * - API routes (/api/*) - Not useful for search indexing
 */

import { MetadataRoute } from 'next';

const BASE_URL = 'https://istheferryrunning.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: '/api/',
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
