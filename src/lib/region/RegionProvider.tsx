'use client';

/**
 * Region Context Provider
 *
 * Phase 62: Global Region State + Route Guardrails
 *
 * Provides global region state that:
 * - Persists in cookies
 * - Is accessible from any page
 * - Syncs with URL region params
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  RegionId,
  isValidRegionId,
  setRegionCookie,
  getRegionFromCookie,
  clearRegionCookie,
  getRegionDisplayName,
} from './state';

interface RegionContextValue {
  // Current active region
  activeRegionId: RegionId | null;
  // Display name for active region
  activeRegionName: string | null;
  // Set active region (updates cookie)
  setActiveRegion: (regionId: RegionId) => void;
  // Clear active region (clears cookie, returns to home)
  clearActiveRegion: () => void;
  // Check if user has selected a region
  hasActiveRegion: boolean;
  // Loading state
  isLoading: boolean;
}

const RegionContext = createContext<RegionContextValue | null>(null);

export function useRegion(): RegionContextValue {
  const context = useContext(RegionContext);
  if (!context) {
    throw new Error('useRegion must be used within a RegionProvider');
  }
  return context;
}

interface RegionProviderProps {
  children: ReactNode;
  // Optional: Initial region from server-side cookie parsing
  initialRegionId?: RegionId | null;
}

export function RegionProvider({ children, initialRegionId }: RegionProviderProps) {
  const [activeRegionId, setActiveRegionId] = useState<RegionId | null>(initialRegionId ?? null);
  const [isLoading, setIsLoading] = useState(!initialRegionId);

  // Load region from cookie on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined' && !initialRegionId) {
      const cookieRegion = getRegionFromCookie();
      if (cookieRegion) {
        setActiveRegionId(cookieRegion);
      }
      setIsLoading(false);
    }
  }, [initialRegionId]);

  const setActiveRegion = useCallback((regionId: RegionId) => {
    if (isValidRegionId(regionId)) {
      setActiveRegionId(regionId);
      setRegionCookie(regionId);
    }
  }, []);

  const clearActiveRegion = useCallback(() => {
    setActiveRegionId(null);
    clearRegionCookie();
  }, []);

  const value: RegionContextValue = {
    activeRegionId,
    activeRegionName: activeRegionId ? getRegionDisplayName(activeRegionId) : null,
    setActiveRegion,
    clearActiveRegion,
    hasActiveRegion: activeRegionId !== null,
    isLoading,
  };

  return (
    <RegionContext.Provider value={value}>
      {children}
    </RegionContext.Provider>
  );
}
