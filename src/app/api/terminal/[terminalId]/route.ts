import { NextRequest, NextResponse } from 'next/server';
import { getDailyTerminalBoard } from '@/lib/terminal-board';
import { isValidTerminal } from '@/lib/config/terminals';
import type { TerminalBoardResponse } from '@/types/terminal-board';

// Cache configuration
const CACHE_MAX_AGE = 300; // 5 minutes

interface RouteParams {
  params: Promise<{
    terminalId: string;
  }>;
}

/**
 * GET /api/terminal/:terminalId
 *
 * Returns the Daily Terminal Board for a terminal.
 *
 * Phase 19: Terminal-Centric Architecture
 *
 * This endpoint produces a DailyTerminalBoard containing:
 * - All departures from this terminal (all operators, all destinations)
 * - Interleaved chronologically as they would appear on a departure board
 * - Layer 1: Operator status overlays (when available)
 * - Layer 2: Forecast risk overlays (when weather context provided)
 *
 * THREE-LAYER TRUTH MODEL:
 * - Layer 0: Schedule (template) = base truth
 * - Layer 1: Operator Status = sparse overlay
 * - Layer 2: Forecast Risk = interpretive only
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<TerminalBoardResponse>> {
  const { terminalId } = await params;

  // Validate terminal
  if (!isValidTerminal(terminalId)) {
    return NextResponse.json(
      {
        success: false,
        board: null,
        error: `Terminal "${terminalId}" not found`,
      },
      { status: 404 }
    );
  }

  try {
    // Get the terminal board
    // Note: Weather context could be passed via query params in future
    const board = await getDailyTerminalBoard(terminalId, null);

    if (!board) {
      return NextResponse.json(
        {
          success: false,
          board: null,
          error: `Failed to generate board for terminal "${terminalId}"`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        board,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=60`,
        },
      }
    );
  } catch (error) {
    console.error(`Error generating terminal board for ${terminalId}:`, error);

    return NextResponse.json(
      {
        success: false,
        board: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
