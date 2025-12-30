/**
 * Corridor Board API Endpoint
 *
 * Phase 21: Service Corridor Architecture
 *
 * GET /api/corridor/[corridorId]
 *
 * Returns a DailyCorridorBoard with all sailings in both directions,
 * interleaved and ordered by time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyCorridorBoard } from '@/lib/corridor-board';
import { isValidCorridor } from '@/lib/config/corridors';
import type { CorridorBoardResponse } from '@/types/corridor';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ corridorId: string }> }
): Promise<NextResponse<CorridorBoardResponse>> {
  const { corridorId } = await params;

  // Validate corridor ID
  if (!corridorId || !isValidCorridor(corridorId)) {
    return NextResponse.json(
      {
        success: false,
        board: null,
        error: `Invalid corridor ID: ${corridorId}`,
      },
      { status: 400 }
    );
  }

  try {
    // Generate corridor board
    // Weather context could be passed here in future
    const board = await getDailyCorridorBoard(corridorId);

    if (!board) {
      return NextResponse.json(
        {
          success: false,
          board: null,
          error: `Corridor not found: ${corridorId}`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      board,
    });
  } catch (error) {
    console.error(`Error generating corridor board for ${corridorId}:`, error);

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
