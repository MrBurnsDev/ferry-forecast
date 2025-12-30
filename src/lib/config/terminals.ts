/**
 * Terminal Configuration
 *
 * Phase 19: Terminal-Centric Architecture
 *
 * Terminals are the primary UI concept - ferries depart FROM terminals.
 * This config defines all terminals and their relationships to routes/operators.
 *
 * DESIGN FOR SCALE:
 * - Multiple operators can serve the same terminal
 * - Multiple terminals can serve the same operator
 * - Terminal definitions are operator-agnostic
 */

import type { Terminal, BoardOperator } from '@/types/terminal-board';
import { ROUTES } from './routes';

// ============================================================
// TERMINAL DEFINITIONS
// ============================================================

/**
 * All terminals in the system
 *
 * Terminals are identified by their port ID but include additional
 * metadata for display and timezone handling.
 */
export const TERMINALS: Terminal[] = [
  {
    id: 'woods-hole',
    name: 'Woods Hole',
    timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
  },
  {
    id: 'vineyard-haven',
    name: 'Vineyard Haven',
    timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
  },
  {
    id: 'oak-bluffs',
    name: 'Oak Bluffs',
    timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
  },
  {
    id: 'hyannis',
    name: 'Hyannis',
    timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
  },
  {
    id: 'nantucket',
    name: 'Nantucket',
    timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
  },
];

/**
 * Operator definitions with status page URLs
 */
export const OPERATORS: BoardOperator[] = [
  {
    id: 'steamship-authority',
    name: 'The Steamship Authority',
    status_url: 'https://www.steamshipauthority.com/traveling_today/status',
  },
  {
    id: 'hy-line-cruises',
    name: 'Hy-Line Cruises',
    status_url: 'https://hylinecruises.com/schedules/',
  },
];

// ============================================================
// TERMINAL LOOKUP HELPERS
// ============================================================

/**
 * Get terminal by ID
 */
export function getTerminalById(terminalId: string): Terminal | null {
  return TERMINALS.find((t) => t.id === terminalId) || null;
}

/**
 * Get all terminals in a region
 */
export function getTerminalsByRegion(regionId: string): Terminal[] {
  return TERMINALS.filter((t) => t.region_id === regionId);
}

/**
 * Get operator by ID
 */
export function getOperatorById(operatorId: string): BoardOperator | null {
  return OPERATORS.find((o) => o.id === operatorId) || null;
}

/**
 * Get operators serving a terminal
 *
 * Computed from routes - any operator with a route involving this terminal
 * (either departing from or arriving at).
 */
export function getOperatorsForTerminal(terminalId: string): BoardOperator[] {
  // Find all operators that have routes involving this terminal
  const operatorIds = new Set<string>();

  for (const route of ROUTES) {
    if ((route.origin_port === terminalId || route.destination_port === terminalId) && route.active) {
      operatorIds.add(route.operator);
    }
  }

  return OPERATORS.filter((o) => operatorIds.has(o.id));
}

/**
 * Get destinations reachable from a terminal
 *
 * Returns all ports that can be reached by departures from this terminal.
 */
export function getDestinationsFromTerminal(terminalId: string): Terminal[] {
  const destinationIds = new Set<string>();

  for (const route of ROUTES) {
    if (route.origin_port === terminalId && route.active) {
      destinationIds.add(route.destination_port);
    }
  }

  return TERMINALS.filter((t) => destinationIds.has(t.id));
}

/**
 * Get routes departing from a terminal
 *
 * Returns route IDs for all routes originating from this terminal.
 */
export function getRoutesFromTerminal(terminalId: string): string[] {
  return ROUTES
    .filter((r) => r.origin_port === terminalId && r.active)
    .map((r) => r.route_id);
}

/**
 * Get ALL routes involving a terminal (departures AND arrivals)
 *
 * For a terminal board that mirrors SSA's "Traveling Today" page,
 * we need both directions - sailings departing FROM and arriving TO.
 */
export function getAllRoutesForTerminal(terminalId: string): string[] {
  return ROUTES
    .filter((r) => (r.origin_port === terminalId || r.destination_port === terminalId) && r.active)
    .map((r) => r.route_id);
}

/**
 * Get ALL routes involving a terminal for a specific operator
 */
export function getAllRoutesForTerminalByOperator(
  terminalId: string,
  operatorId: string
): string[] {
  return ROUTES
    .filter(
      (r) =>
        (r.origin_port === terminalId || r.destination_port === terminalId) &&
        r.operator === operatorId &&
        r.active
    )
    .map((r) => r.route_id);
}

/**
 * Get routes departing from a terminal for a specific operator
 */
export function getRoutesFromTerminalByOperator(
  terminalId: string,
  operatorId: string
): string[] {
  return ROUTES
    .filter(
      (r) =>
        r.origin_port === terminalId &&
        r.operator === operatorId &&
        r.active
    )
    .map((r) => r.route_id);
}

/**
 * Get route ID for a specific origin-destination-operator combination
 */
export function getRouteId(
  originId: string,
  destinationId: string,
  operatorId: string
): string | null {
  const route = ROUTES.find(
    (r) =>
      r.origin_port === originId &&
      r.destination_port === destinationId &&
      r.operator === operatorId &&
      r.active
  );
  return route?.route_id || null;
}

/**
 * Check if a terminal ID is valid
 */
export function isValidTerminal(terminalId: string): boolean {
  return TERMINALS.some((t) => t.id === terminalId);
}

/**
 * Get terminal display name (convenience wrapper)
 */
export function getTerminalDisplayName(terminalId: string): string {
  const terminal = getTerminalById(terminalId);
  return terminal?.name || terminalId;
}

// ============================================================
// SSA-SPECIFIC TERMINAL MAPPING
// ============================================================

/**
 * Map SSA route name to terminals it serves
 *
 * Used to filter status page data by terminal.
 */
export const SSA_ROUTE_TERMINALS: Record<string, string[]> = {
  vineyard: ['woods-hole', 'vineyard-haven', 'oak-bluffs'],
  nantucket: ['hyannis', 'nantucket'],
};

/**
 * Get which SSA "route name" a terminal belongs to
 */
export function getSSARouteForTerminal(terminalId: string): 'vineyard' | 'nantucket' | null {
  if (['woods-hole', 'vineyard-haven', 'oak-bluffs'].includes(terminalId)) {
    return 'vineyard';
  }
  if (['hyannis', 'nantucket'].includes(terminalId)) {
    return 'nantucket';
  }
  return null;
}
