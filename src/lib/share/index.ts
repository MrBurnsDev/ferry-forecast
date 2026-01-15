/**
 * Share Module
 *
 * Exports for the mystery share quote system.
 */

export { pickShareQuote, determineTier, corridorToRegion } from './pickQuote';
export type { PickQuoteInput, PickQuoteResult } from './pickQuote';
export { QUOTE_POOL, REGIONAL_QUOTES, THEMES, TOTAL_QUOTE_COUNT } from './quotes';
export type { Outcome, ConfidenceTier, Theme, Region } from './quotes';
