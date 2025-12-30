import { NextResponse } from 'next/server';
import { getModelInfo } from '@/lib/scoring/score';

/**
 * GET /api/model
 *
 * Returns current scoring model configuration for transparency.
 * This allows users to understand how risk scores are calculated.
 */
export async function GET(): Promise<NextResponse> {
  const modelInfo = getModelInfo();

  return NextResponse.json(
    {
      model: modelInfo,
      description: {
        scoring_philosophy: {
          low_risk: '0-30: Conditions favorable, disruptions unlikely',
          moderate_risk: '31-60: Some concerning factors, monitor conditions',
          high_risk: '61-100: Significant factors present, disruptions likely',
        },
        factors: {
          advisory: 'Marine weather advisories (small craft, gale, storm, hurricane)',
          high_wind: 'Sustained wind speeds above thresholds',
          unfavorable_wind: 'Wind direction creating headwind or crosswind conditions',
          gusts: 'Wind gust intensity above sustained speeds',
          tide: 'Extreme tidal swings affecting docking',
          exposure: 'Open water crossings more exposed to conditions',
          historical: 'Pattern matching against past disruptions in similar conditions',
        },
        confidence: {
          high: 'Multiple data sources available, historical patterns match',
          medium: 'Core data available, limited historical correlation',
          low: 'Limited data sources, no historical comparison',
        },
      },
      disclaimer:
        'This model provides predictions based on weather conditions and historical patterns. ' +
        'Always check with ferry operators for official service status.',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600', // 1 hour cache
      },
    }
  );
}
