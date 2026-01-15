/**
 * Facebook Share API
 *
 * POST /api/share/facebook
 *
 * Generates a mystery share quote and returns a Facebook share URL.
 * The quote is only generated when this endpoint is called (on share click).
 */

import { NextRequest, NextResponse } from 'next/server';
import { pickShareQuote, corridorToRegion, type Outcome, type Region } from '@/lib/share';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ferry-forecast.vercel.app';

interface ShareRequest {
  sailingId?: string;
  corridorId: string;
  outcome: Outcome;
  modelProbability: number; // 0-100 or 0-1, we normalize
  region?: Region;
  betType?: 'will_sail' | 'will_cancel';
  departureTime?: string;
  route?: string;
}

interface ShareResponse {
  success: boolean;
  shareUrl: string;
  quoteText: string;
  predictionUrl: string;
  metadata?: {
    tier: string;
    theme: string;
    regionUsed: boolean;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ShareResponse>> {
  try {
    const body = await request.json() as ShareRequest;

    // Validate required fields
    if (!body.corridorId) {
      return NextResponse.json({
        success: false,
        shareUrl: '',
        quoteText: '',
        predictionUrl: '',
        error: 'corridorId is required',
      }, { status: 400 });
    }

    if (!body.outcome || !['correct', 'incorrect'].includes(body.outcome)) {
      return NextResponse.json({
        success: false,
        shareUrl: '',
        quoteText: '',
        predictionUrl: '',
        error: 'outcome must be "correct" or "incorrect"',
      }, { status: 400 });
    }

    if (typeof body.modelProbability !== 'number') {
      return NextResponse.json({
        success: false,
        shareUrl: '',
        quoteText: '',
        predictionUrl: '',
        error: 'modelProbability is required and must be a number',
      }, { status: 400 });
    }

    // Normalize probability to 0-1 range
    let probability = body.modelProbability;
    if (probability > 1) {
      probability = probability / 100;
    }
    probability = Math.max(0, Math.min(1, probability));

    // Determine region from corridorId if not provided
    const region = body.region || corridorToRegion(body.corridorId);

    // Generate the quote
    const quoteResult = pickShareQuote({
      outcome: body.outcome,
      modelProbability: probability,
      region,
    });

    // Build the prediction URL (links to corridor page)
    const predictionUrl = `${BASE_URL}/corridor/${body.corridorId}`;

    // Build context for the share text
    const betTypeText = body.betType === 'will_sail' ? 'Will Sail' : body.betType === 'will_cancel' ? 'Will Cancel' : null;
    const routeText = body.route || formatCorridorName(body.corridorId);
    const timeText = body.departureTime || '';

    // Build full share text with quote + prediction context
    let fullShareText = quoteResult.quoteText;

    // Add prediction context if available
    if (betTypeText && routeText) {
      const outcomeWord = body.outcome === 'correct' ? 'correctly' : 'incorrectly';
      const sailingInfo = timeText ? `${timeText} ${routeText}` : routeText;
      fullShareText += ` I ${outcomeWord} predicted "${betTypeText}" for the ${sailingInfo} ferry.`;
    }

    // Add call to action
    fullShareText += ' Check the live forecast!';

    // Build Facebook share URL
    // Facebook sharer.php with quote parameter (may be ignored by FB, but we try)
    const facebookShareUrl = buildFacebookShareUrl(predictionUrl, fullShareText);

    // Log share event (for analytics)
    console.log('[SHARE] share_initiated', {
      tier: quoteResult.metadata.tier,
      theme: quoteResult.metadata.theme,
      regionUsed: quoteResult.metadata.regionUsed,
      outcome: body.outcome,
      corridorId: body.corridorId,
    });

    return NextResponse.json({
      success: true,
      shareUrl: facebookShareUrl,
      quoteText: fullShareText,
      predictionUrl,
      metadata: {
        tier: quoteResult.metadata.tier,
        theme: quoteResult.metadata.theme,
        regionUsed: quoteResult.metadata.regionUsed,
      },
    });
  } catch (error) {
    console.error('[SHARE] Error generating share:', error);
    return NextResponse.json({
      success: false,
      shareUrl: '',
      quoteText: '',
      predictionUrl: '',
      error: 'Failed to generate share',
    }, { status: 500 });
  }
}

/**
 * Build Facebook share URL with quote
 *
 * Note: Facebook's sharer.php has limitations on prefilled text.
 * The `quote` parameter may be ignored in some cases.
 * We include it for best-effort support.
 */
function buildFacebookShareUrl(url: string, quote: string): string {
  const params = new URLSearchParams({
    u: url,
    quote: quote,
  });
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}

/**
 * Format corridor ID into readable name
 */
function formatCorridorName(corridorId: string): string {
  return corridorId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
