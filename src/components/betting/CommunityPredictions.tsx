'use client';

/**
 * Community Predictions Display
 *
 * Phase 98: Shows aggregated prediction counts for a sailing.
 * Displays the count of users who predicted "Will Sail" vs "Will Cancel".
 *
 * Features:
 * - Fetches from /api/predictions/aggregate
 * - Shows counts even when not logged in (public data)
 * - Refreshes when user places a prediction
 * - Minimal visual footprint - just thumbs + counts
 */

import { useState, useEffect, useCallback } from 'react';
import { useBetting } from '@/lib/betting';

interface CommunityPredictionsProps {
  sailingId: string;
  /** If true, show inline compact variant */
  compact?: boolean;
  className?: string;
}

interface PredictionAggregate {
  total: number;
  will_sail: number;
  will_cancel: number;
}

export function CommunityPredictions({
  sailingId,
  compact = false,
  className = '',
}: CommunityPredictionsProps) {
  const [aggregate, setAggregate] = useState<PredictionAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get betting state to detect when user places a prediction
  const betting = useBetting();
  const userBet = betting.getBetForSailing(sailingId);

  const fetchAggregate = useCallback(async () => {
    try {
      const res = await fetch(`/api/predictions/aggregate?sailing_id=${encodeURIComponent(sailingId)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch predictions');
      }
      const data = await res.json();
      const agg = data.aggregates?.[sailingId];
      if (agg) {
        setAggregate(agg);
      } else {
        // No predictions yet - show zeros
        setAggregate({ total: 0, will_sail: 0, will_cancel: 0 });
      }
      setError(null);
    } catch (err) {
      console.error('[COMMUNITY_PREDICTIONS] Fetch failed:', err);
      setError('Failed to load');
      setAggregate(null);
    } finally {
      setLoading(false);
    }
  }, [sailingId]);

  // Initial fetch
  useEffect(() => {
    fetchAggregate();
  }, [fetchAggregate]);

  // Refetch when user's bet changes (they just placed or changed a prediction)
  useEffect(() => {
    if (userBet) {
      // Small delay to allow server to process
      const timeout = setTimeout(fetchAggregate, 500);
      return () => clearTimeout(timeout);
    }
  }, [userBet, fetchAggregate]);

  // Don't show anything while loading or if error
  if (loading) {
    return null;
  }

  if (error || !aggregate) {
    return null;
  }

  // Don't show if no predictions yet
  if (aggregate.total === 0) {
    return null;
  }

  // Compact variant - minimal inline display
  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
        <span title="Community predictions: Will Sail">
          <span className="opacity-70">Community:</span>{' '}
          <span className="text-success">+{aggregate.will_sail}</span>
          <span className="mx-0.5">/</span>
          <span className="text-destructive">-{aggregate.will_cancel}</span>
        </span>
      </div>
    );
  }

  // Full display
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-xs text-muted-foreground">Community:</span>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-success-muted/20 text-success"
          title="Users predicting sailing will run"
        >
          <span>Will Sail</span>
          <span className="font-semibold">{aggregate.will_sail}</span>
        </span>
        <span
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-destructive-muted/20 text-destructive"
          title="Users predicting sailing will be canceled"
        >
          <span>Will Cancel</span>
          <span className="font-semibold">{aggregate.will_cancel}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Hook for fetching community predictions for multiple sailings at once.
 * Use this at the board level to batch fetch all predictions efficiently.
 */
export function useCommunityPredictions(sailingIds: string[]) {
  const [aggregates, setAggregates] = useState<Record<string, PredictionAggregate>>({});
  const [loading, setLoading] = useState(true);

  // Memoize the joined IDs string to use as a stable dependency
  const idsKey = sailingIds.join(',');

  useEffect(() => {
    if (sailingIds.length === 0) {
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      try {
        const idsParam = sailingIds.join(',');
        const res = await fetch(`/api/predictions/aggregate?sailing_ids=${encodeURIComponent(idsParam)}`);
        if (res.ok) {
          const data = await res.json();
          setAggregates(data.aggregates || {});
        }
      } catch (err) {
        console.error('[COMMUNITY_PREDICTIONS] Batch fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [idsKey, sailingIds]); // Re-fetch when sailing IDs change

  return { aggregates, loading };
}
