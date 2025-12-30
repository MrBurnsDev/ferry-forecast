/**
 * Service Corridor Configuration
 *
 * Phase 21: Service Corridor Architecture
 *
 * Corridors define bidirectional ferry services between terminals.
 * This is the correct abstraction for the primary UX - users want to know
 * "What's running between Woods Hole and Martha's Vineyard today?"
 *
 * DESIGN FOR SCALE:
 * - Multiple operators can serve the same corridor
 * - Seasonal corridors are supported (active flag)
 * - New operators (Island Queen, etc.) just add to supported_operators
 * - National scale without N² route explosion
 */

import type { ServiceCorridor, CorridorSummary } from '@/types/corridor';
import type { Terminal, BoardOperator } from '@/types/terminal-board';
import { getTerminalById, getOperatorById } from './terminals';

// ============================================================
// CORRIDOR DEFINITIONS
// ============================================================

/**
 * All service corridors in the system
 *
 * Each corridor represents a bidirectional ferry service between two terminals.
 * The terminal_a/terminal_b naming is arbitrary but consistent.
 */
export const CORRIDORS: ServiceCorridor[] = [
  // Woods Hole ↔ Vineyard Haven (SSA main route)
  {
    id: 'woods-hole-vineyard-haven',
    display_name: 'Woods Hole ↔ Vineyard Haven',
    terminal_a: 'woods-hole',
    terminal_b: 'vineyard-haven',
    supported_operators: ['steamship-authority'],
    default_timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
    active: true,
    route_ids: ['wh-vh-ssa', 'vh-wh-ssa'],
  },
  // Woods Hole ↔ Oak Bluffs (SSA seasonal)
  {
    id: 'woods-hole-oak-bluffs',
    display_name: 'Woods Hole ↔ Oak Bluffs',
    terminal_a: 'woods-hole',
    terminal_b: 'oak-bluffs',
    supported_operators: ['steamship-authority'],
    default_timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
    active: true,
    route_ids: ['wh-ob-ssa', 'ob-wh-ssa'],
  },
  // Hyannis ↔ Nantucket (SSA + Hy-Line)
  {
    id: 'hyannis-nantucket',
    display_name: 'Hyannis ↔ Nantucket',
    terminal_a: 'hyannis',
    terminal_b: 'nantucket',
    supported_operators: ['steamship-authority', 'hy-line-cruises'],
    default_timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
    active: true,
    route_ids: ['hy-nan-ssa', 'nan-hy-ssa', 'hy-nan-hlc', 'nan-hy-hlc'],
  },
  // Hyannis ↔ Vineyard Haven (Hy-Line only)
  {
    id: 'hyannis-vineyard-haven',
    display_name: 'Hyannis ↔ Vineyard Haven',
    terminal_a: 'hyannis',
    terminal_b: 'vineyard-haven',
    supported_operators: ['hy-line-cruises'],
    default_timezone: 'America/New_York',
    region_id: 'cape-cod-islands',
    active: true,
    route_ids: ['hy-vh-hlc', 'vh-hy-hlc'],
  },
];

// ============================================================
// CORRIDOR LOOKUP HELPERS
// ============================================================

/**
 * Get corridor by ID
 */
export function getCorridorById(corridorId: string): ServiceCorridor | null {
  return CORRIDORS.find((c) => c.id === corridorId && c.active) || null;
}

/**
 * Get all active corridors
 */
export function getActiveCorridors(): ServiceCorridor[] {
  return CORRIDORS.filter((c) => c.active);
}

/**
 * Get corridors by region
 */
export function getCorridorsByRegion(regionId: string): ServiceCorridor[] {
  return CORRIDORS.filter((c) => c.region_id === regionId && c.active);
}

/**
 * Get corridors serving a terminal
 *
 * Returns all corridors where this terminal is either terminal_a or terminal_b.
 */
export function getCorridorsForTerminal(terminalId: string): ServiceCorridor[] {
  return CORRIDORS.filter(
    (c) => (c.terminal_a === terminalId || c.terminal_b === terminalId) && c.active
  );
}

/**
 * Get corridor summaries for a terminal (for discovery UI)
 *
 * Returns simplified corridor info showing what destinations are reachable
 * from this terminal and which operators serve them.
 */
export function getCorridorSummariesForTerminal(terminalId: string): CorridorSummary[] {
  const corridors = getCorridorsForTerminal(terminalId);

  return corridors.map((corridor) => {
    // Determine which terminal is "other" from the user's perspective
    const otherTerminalId =
      corridor.terminal_a === terminalId ? corridor.terminal_b : corridor.terminal_a;

    const otherTerminal = getTerminalById(otherTerminalId);
    const operators = corridor.supported_operators
      .map((id) => getOperatorById(id))
      .filter((op): op is BoardOperator => op !== null);

    return {
      id: corridor.id,
      display_name: corridor.display_name,
      other_terminal: otherTerminal || {
        id: otherTerminalId,
        name: otherTerminalId,
        timezone: 'America/New_York',
        region_id: 'cape-cod-islands',
      },
      operators,
    };
  });
}

/**
 * Get the corridor connecting two terminals (if exists)
 */
export function getCorridorBetweenTerminals(
  terminalA: string,
  terminalB: string
): ServiceCorridor | null {
  return (
    CORRIDORS.find(
      (c) =>
        ((c.terminal_a === terminalA && c.terminal_b === terminalB) ||
          (c.terminal_a === terminalB && c.terminal_b === terminalA)) &&
        c.active
    ) || null
  );
}

/**
 * Get route IDs for a corridor
 *
 * Returns all route IDs (both directions) for this corridor.
 */
export function getRouteIdsForCorridor(corridorId: string): string[] {
  const corridor = getCorridorById(corridorId);
  return corridor?.route_ids || [];
}

/**
 * Get operators for a corridor
 */
export function getOperatorsForCorridor(corridorId: string): BoardOperator[] {
  const corridor = getCorridorById(corridorId);
  if (!corridor) return [];

  return corridor.supported_operators
    .map((id) => getOperatorById(id))
    .filter((op): op is BoardOperator => op !== null);
}

/**
 * Check if a corridor ID is valid
 */
export function isValidCorridor(corridorId: string): boolean {
  return CORRIDORS.some((c) => c.id === corridorId && c.active);
}

/**
 * Get both terminals for a corridor
 */
export function getCorridorTerminals(corridorId: string): { a: Terminal; b: Terminal } | null {
  const corridor = getCorridorById(corridorId);
  if (!corridor) return null;

  const terminalA = getTerminalById(corridor.terminal_a);
  const terminalB = getTerminalById(corridor.terminal_b);

  if (!terminalA || !terminalB) return null;

  return { a: terminalA, b: terminalB };
}

/**
 * Get the primary status URL for a corridor
 *
 * Prefers SSA if available, falls back to first available operator.
 */
export function getCorridorStatusUrl(corridorId: string): string | undefined {
  const corridor = getCorridorById(corridorId);
  if (!corridor) return undefined;

  // Prefer SSA
  if (corridor.supported_operators.includes('steamship-authority')) {
    const ssa = getOperatorById('steamship-authority');
    return ssa?.status_url;
  }

  // Fall back to first operator
  const firstOp = getOperatorById(corridor.supported_operators[0]);
  return firstOp?.status_url;
}
