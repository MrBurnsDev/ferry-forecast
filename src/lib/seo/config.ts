/**
 * SEO Configuration
 *
 * Centralized SEO metadata generation for all pages.
 * Designed for global scalability - location names are examples, not limitations.
 */

import type { Metadata } from 'next';

export const BASE_URL = 'https://www.istheferryrunning.com';

// ============================================================
// TERMINAL SEO METADATA
// ============================================================

interface TerminalSEOConfig {
  displayName: string;
  region: string;
  destinations: string[];
  weatherNote: string;
}

export const TERMINAL_SEO: Record<string, TerminalSEOConfig> = {
  'woods-hole': {
    displayName: 'Woods Hole',
    region: 'Cape Cod',
    destinations: ['Martha\'s Vineyard', 'Oak Bluffs'],
    weatherNote: 'Woods Hole is exposed to southwest winds from Buzzards Bay, which can cause delays during storms. Ferries to Martha\'s Vineyard cross Vineyard Sound, where wind and wave conditions vary by direction.',
  },
  'vineyard-haven': {
    displayName: 'Vineyard Haven',
    region: 'Martha\'s Vineyard',
    destinations: ['Woods Hole', 'Hyannis'],
    weatherNote: 'Vineyard Haven Harbor provides some protection, but ferries crossing Vineyard Sound to the mainland face open-water conditions where wind speed and direction significantly affect operations.',
  },
  'oak-bluffs': {
    displayName: 'Oak Bluffs',
    region: 'Martha\'s Vineyard',
    destinations: ['Woods Hole'],
    weatherNote: 'Oak Bluffs is a seasonal port with more exposure to easterly winds. Summer service may be affected differently than year-round routes due to weather patterns and vessel assignments.',
  },
  'hyannis': {
    displayName: 'Hyannis',
    region: 'Cape Cod',
    destinations: ['Nantucket', 'Martha\'s Vineyard'],
    weatherNote: 'Hyannis serves as the mainland hub for Nantucket ferries. The Nantucket Sound crossing is longer and more exposed than Vineyard routes, making it more sensitive to wind and wave conditions.',
  },
  'nantucket': {
    displayName: 'Nantucket',
    region: 'Nantucket Island',
    destinations: ['Hyannis'],
    weatherNote: 'Nantucket is the most isolated island destination. The 26-mile crossing to Hyannis takes longer and faces open Atlantic conditions, particularly during nor\'easters and strong southwest winds.',
  },
};

export function generateTerminalMetadata(terminalId: string): Metadata {
  const config = TERMINAL_SEO[terminalId];
  if (!config) {
    return {
      title: `Ferry Status`,
      description: 'Check ferry running status and delay predictions.',
    };
  }

  const title = `Is the Ferry Running from ${config.displayName} Today?`;
  const description = `Check if ferries from ${config.displayName} are running today. View delay and cancellation likelihoods to ${config.destinations.join(' and ')} based on weather and historical data.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/terminal/${terminalId}`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/terminal/${terminalId}`,
    },
  };
}

// ============================================================
// CORRIDOR SEO METADATA
// ============================================================

interface CorridorSEOConfig {
  displayName: string;
  terminalA: string;
  terminalB: string;
  weatherNote: string;
}

export const CORRIDOR_SEO: Record<string, CorridorSEOConfig> = {
  'woods-hole-vineyard-haven': {
    displayName: 'Woods Hole to Martha\'s Vineyard',
    terminalA: 'Woods Hole',
    terminalB: 'Vineyard Haven',
    weatherNote: 'This primary route to Martha\'s Vineyard crosses Vineyard Sound. Southwest winds from Buzzards Bay can create challenging conditions, while northeast winds may cause schedule disruptions during storms.',
  },
  'woods-hole-oak-bluffs': {
    displayName: 'Woods Hole to Oak Bluffs',
    terminalA: 'Woods Hole',
    terminalB: 'Oak Bluffs',
    weatherNote: 'The seasonal Oak Bluffs route offers a direct connection to downtown. Weather impacts are similar to Vineyard Haven, though the slightly different approach may affect operations in certain wind conditions.',
  },
  'hyannis-nantucket': {
    displayName: 'Hyannis to Nantucket',
    terminalA: 'Hyannis',
    terminalB: 'Nantucket',
    weatherNote: 'The longest ferry route in the region, crossing 26 miles of Nantucket Sound. High-speed ferries are more weather-sensitive than traditional vessels. Strong southwest winds and nor\'easters frequently impact this route.',
  },
  'hyannis-vineyard-haven': {
    displayName: 'Hyannis to Martha\'s Vineyard',
    terminalA: 'Hyannis',
    terminalB: 'Vineyard Haven',
    weatherNote: 'This seasonal route provides an alternative to Woods Hole, crossing Nantucket Sound to Vineyard Haven. Weather conditions differ from the primary Woods Hole route.',
  },
};

export function generateCorridorMetadata(corridorId: string, operatorName?: string): Metadata {
  const config = CORRIDOR_SEO[corridorId];
  if (!config) {
    return {
      title: 'Ferry Status',
      description: 'Check ferry running status and delay predictions.',
    };
  }

  const routeDesc = `${config.terminalA} ↔ ${config.terminalB}`;
  const operatorSuffix = operatorName ? ` (${operatorName})` : '';
  const title = `Is the Ferry Running from ${config.terminalA} to ${config.terminalB} Today?`;
  const description = `Check if ferries on the ${routeDesc} route${operatorSuffix} are running today. View delay and cancellation likelihoods based on current weather and historical data.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/corridor/${corridorId}`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/corridor/${corridorId}`,
    },
  };
}

// ============================================================
// REGION SEO METADATA
// ============================================================

interface RegionSEOConfig {
  displayName: string;
  description: string;
  terminals: string[];
  weatherNote: string;
}

export const REGION_SEO: Record<string, RegionSEOConfig> = {
  'cci': {
    displayName: 'Cape Cod & Islands',
    description: 'Martha\'s Vineyard and Nantucket ferry services',
    terminals: ['Woods Hole', 'Hyannis', 'Vineyard Haven', 'Oak Bluffs', 'Nantucket'],
    weatherNote: 'The Cape Cod & Islands region experiences variable maritime weather. Nor\'easters, southwest winds from Buzzards Bay, and fog can all impact ferry operations. Each route responds differently to weather conditions based on exposure and vessel type.',
  },
};

export function generateRegionMetadata(regionId: string): Metadata {
  const config = REGION_SEO[regionId];
  if (!config) {
    return {
      title: 'Ferry Status by Region',
      description: 'Check ferry running status and delay predictions by region.',
    };
  }

  const title = `Is the Ferry Running to ${config.displayName} Today?`;
  const description = `Check ferry status for ${config.displayName}. View delay and cancellation likelihoods for ferries serving ${config.terminals.slice(0, 3).join(', ')}, and more.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/region/${regionId}`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/region/${regionId}`,
    },
  };
}

// ============================================================
// OPERATOR SEO METADATA
// ============================================================

interface OperatorSEOConfig {
  displayName: string;
  description: string;
  routes: string[];
}

export const OPERATOR_SEO: Record<string, OperatorSEOConfig> = {
  'ssa': {
    displayName: 'The Steamship Authority',
    description: 'Year-round ferry service to Martha\'s Vineyard and Nantucket',
    routes: ['Woods Hole to Vineyard Haven', 'Woods Hole to Oak Bluffs', 'Hyannis to Nantucket'],
  },
  'hyline': {
    displayName: 'Hy-Line Cruises',
    description: 'High-speed and traditional ferry service to Martha\'s Vineyard and Nantucket',
    routes: ['Hyannis to Nantucket', 'Hyannis to Vineyard Haven'],
  },
};

export function generateOperatorMetadata(operatorId: string): Metadata {
  const config = OPERATOR_SEO[operatorId];
  if (!config) {
    return {
      title: 'Ferry Operator Status',
      description: 'Check ferry running status by operator.',
    };
  }

  const title = `${config.displayName} Ferry Status - Is the Ferry Running?`;
  const description = `Check if ferries operated by ${config.displayName} are running today. View routes: ${config.routes.join(', ')}. Based on weather and historical data.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/operator/${operatorId}`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/operator/${operatorId}`,
    },
  };
}

// ============================================================
// FAQ SCHEMA GENERATORS
// ============================================================

export function generateFAQSchema() {
  const baseQuestions = [
    {
      "@type": "Question",
      "name": "Is the ferry running today?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ferry operations depend on weather and marine conditions. This site estimates likelihood based on historical data and current weather forecasts. It is not an official schedule—always verify with your ferry operator before traveling."
      }
    },
    {
      "@type": "Question",
      "name": "Is this an official ferry operator site?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. This site is independent and analyzes historical outcomes across ferry routes and operators. We are not affiliated with any ferry company, including the Steamship Authority, Hy-Line Cruises, or any other operator."
      }
    },
  ];

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": baseQuestions,
  };
}
