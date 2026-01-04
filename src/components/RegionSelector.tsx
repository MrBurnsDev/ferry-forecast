'use client';

/**
 * Region Selector Component
 *
 * Phase 62: Region State + Route Guardrails
 *
 * A header component that shows the current active region and allows
 * users to switch regions. When switching regions, it clears the
 * operator and route context by navigating to the region page.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRegion } from '@/lib/region';

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

interface RegionSelectorProps {
  className?: string;
}

export function RegionSelector({ className }: RegionSelectorProps) {
  const { activeRegionId, activeRegionName, isLoading } = useRegion();

  // If loading, show skeleton
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-4 w-24 bg-secondary/50 rounded animate-pulse" />
      </div>
    );
  }

  // If no active region, show "Select Region" link
  if (!activeRegionId) {
    return null; // Don't show anything if no region selected (user on home page)
  }

  // Show current region as a link back to region page
  // Per Phase 62: Switching regions clears operator + route context
  return (
    <Link
      href={`/region/${activeRegionId}`}
      className={`flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <MapPinIcon className="w-4 h-4 text-accent" />
      <span>{activeRegionName}</span>
    </Link>
  );
}

/**
 * Region Selector for Navigation Header
 *
 * Shows current region with ability to change regions.
 * Displayed in the header when a region is selected.
 */
export function HeaderRegionSelector() {
  const { activeRegionId, activeRegionName, clearActiveRegion, isLoading } = useRegion();
  const router = useRouter();

  // Don't render anything while loading or if no region selected
  if (isLoading || !activeRegionId) {
    return null;
  }

  const handleClearRegion = () => {
    clearActiveRegion();
    router.push('/');
  };

  return (
    <div className="flex items-center gap-4">
      <Link
        href={`/region/${activeRegionId}`}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <MapPinIcon className="w-4 h-4 text-accent" />
        <span>{activeRegionName}</span>
      </Link>
      <button
        onClick={handleClearRegion}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Change region"
      >
        Change
      </button>
    </div>
  );
}
