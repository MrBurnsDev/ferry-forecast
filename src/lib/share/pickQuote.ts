/**
 * Quote Picking Function
 *
 * Selects a random quote based on outcome, model probability, region, and theme.
 * Uses crypto-strong randomness for fair selection.
 */

import {
  QUOTE_POOL,
  REGIONAL_QUOTES,
  THEMES,
  type Outcome,
  type ConfidenceTier,
  type Theme,
  type Region,
} from './quotes';

export interface PickQuoteInput {
  outcome: Outcome;
  modelProbability: number; // 0..1
  region?: Region;
  themePreference?: Theme;
}

export interface PickQuoteResult {
  quoteText: string;
  metadata: {
    tier: ConfidenceTier;
    theme: Theme;
    regionUsed: boolean;
    outcome: Outcome;
  };
}

/**
 * Determine confidence tier based on outcome and probability
 *
 * For correct predictions:
 * - high: >= 0.75 (easy win, humble)
 * - medium: 0.55 - 0.75 (moderate, satisfied)
 * - low: 0.35 - 0.55 (harder, more satisfied)
 * - very_low: < 0.35 (contrarian win, boasting allowed!)
 *
 * For incorrect predictions:
 * - high: >= 0.75 (was confident but wrong, gentle humility)
 * - low: < 0.75 (was risky, expected to possibly fail)
 */
export function determineTier(outcome: Outcome, probability: number): ConfidenceTier {
  if (outcome === 'correct') {
    if (probability >= 0.75) return 'high';
    if (probability >= 0.55) return 'medium';
    if (probability >= 0.35) return 'low';
    return 'very_low';
  } else {
    // incorrect
    if (probability >= 0.75) return 'high';
    return 'low';
  }
}

/**
 * Get crypto-strong random integer in range [0, max)
 */
function getSecureRandomInt(max: number): number {
  if (max <= 0) return 0;

  // Use crypto if available (browser or Node.js)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % max;
  }

  // Fallback to Math.random (less secure but works everywhere)
  return Math.floor(Math.random() * max);
}

/**
 * Select a random element from an array using secure randomness
 */
function secureRandomPick<T>(array: T[]): T | undefined {
  if (!array || array.length === 0) return undefined;
  return array[getSecureRandomInt(array.length)];
}

/**
 * Pick a share quote based on prediction outcome and conditions
 */
export function pickShareQuote(input: PickQuoteInput): PickQuoteResult {
  const { outcome, modelProbability, region, themePreference } = input;

  // Determine tier based on outcome and probability
  const tier = determineTier(outcome, modelProbability);

  // Try regional quote first if region is provided
  if (region && REGIONAL_QUOTES[region]) {
    const regionalPool = REGIONAL_QUOTES[region][outcome];
    if (regionalPool) {
      // For regional quotes, use simplified tier (high/low)
      const regionalTier = tier === 'very_low' || tier === 'low' ? 'low' : 'high';
      const quotes = regionalPool[regionalTier];

      if (quotes && quotes.length > 0) {
        const quote = secureRandomPick(quotes);
        if (quote) {
          return {
            quoteText: quote,
            metadata: {
              tier,
              theme: 'sailor', // Regional quotes don't have themes
              regionUsed: true,
              outcome,
            },
          };
        }
      }
    }
  }

  // Use main quote pool
  const outcomePool = QUOTE_POOL[outcome];
  if (!outcomePool) {
    return getFallbackQuote(outcome, tier);
  }

  // For incorrect predictions, map medium/very_low to existing tiers
  let effectiveTier = tier;
  if (outcome === 'incorrect') {
    effectiveTier = tier === 'high' ? 'high' : 'low';
  }

  const tierPool = outcomePool[effectiveTier];
  if (!tierPool) {
    return getFallbackQuote(outcome, tier);
  }

  // Select theme
  const theme = themePreference && tierPool[themePreference]
    ? themePreference
    : secureRandomPick(THEMES) || 'sailor';

  const themeQuotes = tierPool[theme];
  if (!themeQuotes || themeQuotes.length === 0) {
    // Try any available theme
    for (const fallbackTheme of THEMES) {
      const fallbackQuotes = tierPool[fallbackTheme];
      if (fallbackQuotes && fallbackQuotes.length > 0) {
        const quote = secureRandomPick(fallbackQuotes);
        if (quote) {
          return {
            quoteText: quote,
            metadata: {
              tier,
              theme: fallbackTheme,
              regionUsed: false,
              outcome,
            },
          };
        }
      }
    }
    return getFallbackQuote(outcome, tier);
  }

  const quote = secureRandomPick(themeQuotes);
  if (!quote) {
    return getFallbackQuote(outcome, tier);
  }

  return {
    quoteText: quote,
    metadata: {
      tier,
      theme,
      regionUsed: false,
      outcome,
    },
  };
}

/**
 * Fallback quotes for edge cases
 */
function getFallbackQuote(outcome: Outcome, tier: ConfidenceTier): PickQuoteResult {
  const fallbackQuotes = {
    correct: {
      high: "I called it! The ferry prediction was spot on.",
      medium: "Another solid prediction in the books.",
      low: "Against the odds, my prediction proved true!",
      very_low: "I saw what others couldn't see!",
    },
    incorrect: {
      high: "Well, even the best predictions miss sometimes.",
      low: "It was a long shot, and it didn't land this time.",
      medium: "The prediction didn't quite work out.",
      very_low: "Fortune wasn't on my side this time.",
    },
  };

  return {
    quoteText: fallbackQuotes[outcome][tier] || "Ferry predictions are an adventure!",
    metadata: {
      tier,
      theme: 'sailor',
      regionUsed: false,
      outcome,
    },
  };
}

/**
 * Map corridor ID to region for regional quote selection
 */
export function corridorToRegion(corridorId: string): Region | undefined {
  const corridorLower = corridorId.toLowerCase();

  if (corridorLower.includes('vineyard') || corridorLower.includes('marthas')) {
    return 'marthas_vineyard';
  }
  if (corridorLower.includes('nantucket')) {
    return 'nantucket';
  }
  if (corridorLower.includes('cape') || corridorLower.includes('hyannis') || corridorLower.includes('falmouth') || corridorLower.includes('woods-hole')) {
    return 'cape_cod';
  }

  return undefined;
}
