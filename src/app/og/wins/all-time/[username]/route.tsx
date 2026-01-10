/**
 * OG Image Generator - All-Time Crown
 *
 * GET /og/wins/all-time/:username.png
 *
 * Generates server-side OpenGraph images for all-time leader pages.
 * Dark nautical theme with crown icon.
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Image dimensions per OG spec
const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  const { username } = params;

  // Strip .png extension if present
  const cleanUsername = username.replace(/\.png$/, '');

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #0a1628 0%, #0f2847 50%, #1a3a5c 100%)',
            fontFamily: 'system-ui, sans-serif',
            position: 'relative',
          }}
        >
          {/* Subtle wave pattern overlay */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: 0.1,
              background: `
                repeating-linear-gradient(
                  0deg,
                  transparent,
                  transparent 20px,
                  rgba(255,255,255,0.03) 20px,
                  rgba(255,255,255,0.03) 40px
                )
              `,
            }}
          />

          {/* Crown Icon */}
          <div
            style={{
              fontSize: 120,
              marginBottom: 20,
              filter: 'drop-shadow(0 4px 12px rgba(255, 215, 0, 0.4))',
            }}
          >
            👑
          </div>

          {/* Username */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              textShadow: '0 2px 4px rgba(0,0,0,0.3)',
            }}
          >
            {cleanUsername}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 36,
              fontWeight: 500,
              color: '#ffd700',
              marginBottom: 24,
              textShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }}
          >
            All-Time Ferry Crown Leader
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 28,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 40,
            }}
          >
            Top of the Leaderboard
          </div>

          {/* Site branding */}
          <div
            style={{
              position: 'absolute',
              bottom: 32,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 24,
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              istheferryrunning.com
            </div>
          </div>
        </div>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      }
    );
  } catch (error) {
    console.error('[OG_IMAGE] Error generating image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
