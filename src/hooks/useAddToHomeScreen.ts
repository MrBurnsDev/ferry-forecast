'use client';

/**
 * useAddToHomeScreen Hook
 *
 * Manages the "Add to Home Screen" prompt lifecycle:
 * - Captures beforeinstallprompt event (Android/Chrome)
 * - Tracks whether prompt should be shown
 * - Handles install flow
 * - Provides platform-specific instructions (iOS)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPlatformInfo,
  shouldShowPrompt,
  recordDismissal,
  recordPromptShown,
  type PlatformInfo,
} from '@/lib/platform';

// Type for the beforeinstallprompt event (not in standard TypeScript)
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Extend Window interface
declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export type InstallState =
  | 'idle'
  | 'prompt_ready'
  | 'prompting'
  | 'installed'
  | 'dismissed';

export interface UseAddToHomeScreenReturn {
  /** Whether the install prompt is available and should be shown */
  canShowPrompt: boolean;
  /** Current state of the install flow */
  installState: InstallState;
  /** Platform information */
  platform: PlatformInfo | null;
  /** Trigger the native install prompt (Android only) */
  triggerInstall: () => Promise<void>;
  /** Dismiss the prompt (records to localStorage) */
  dismissPrompt: () => void;
  /** Whether the app is already installed */
  isInstalled: boolean;
  /** Whether to show iOS-specific instructions */
  showIOSInstructions: boolean;
}

/** Delay before showing prompt (milliseconds) */
const PROMPT_DELAY_MS = 10000; // 10 seconds

export function useAddToHomeScreen(): UseAddToHomeScreenReturn {
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [canShowPrompt, setCanShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // Store the beforeinstallprompt event
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const hasShownRef = useRef(false);

  // Initialize platform detection
  useEffect(() => {
    const info = getPlatformInfo();
    setPlatform(info);
    setIsInstalled(info.isStandalone);

    // Log for analytics
    console.log('[PWA] Platform detected:', info);
  }, []);

  // Listen for beforeinstallprompt event (Android/Chrome)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();

      // Store the event for later use
      deferredPromptRef.current = e;
      setInstallState('prompt_ready');

      console.log('[PWA] beforeinstallprompt event captured');
    };

    const handleAppInstalled = () => {
      console.log('[PWA] install_success - App was installed');
      setInstallState('installed');
      setIsInstalled(true);
      setCanShowPrompt(false);
      deferredPromptRef.current = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Determine if we should show the prompt (with delay)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasShownRef.current) return;
    if (isInstalled) return;

    // Check if prompt should be shown based on localStorage state
    if (!shouldShowPrompt()) {
      return;
    }

    // Wait for platform detection
    if (!platform) return;

    // Only show on mobile
    if (!platform.isMobile) return;

    // Set a timer to show the prompt after delay
    const timer = setTimeout(() => {
      if (hasShownRef.current) return;

      // For iOS, we can show instructions immediately
      // For Android, we need the beforeinstallprompt event
      if (platform.isIOS || deferredPromptRef.current) {
        setCanShowPrompt(true);
        hasShownRef.current = true;
        recordPromptShown();
        console.log('[PWA] prompt_shown');
      }
    }, PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [platform, isInstalled]);

  // Trigger the native install prompt (Android/Chrome only)
  const triggerInstall = useCallback(async () => {
    console.log('[PWA] install_clicked');

    if (!deferredPromptRef.current) {
      console.log('[PWA] No deferred prompt available');
      return;
    }

    setInstallState('prompting');

    try {
      // Show the native install prompt
      await deferredPromptRef.current.prompt();

      // Wait for user choice
      const { outcome } = await deferredPromptRef.current.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
        setInstallState('installed');
        setIsInstalled(true);
      } else {
        console.log('[PWA] User dismissed the install prompt');
        setInstallState('dismissed');
      }
    } catch (error) {
      console.error('[PWA] Error triggering install:', error);
      setInstallState('idle');
    }

    // Clear the deferred prompt
    deferredPromptRef.current = null;
    setCanShowPrompt(false);
  }, []);

  // Dismiss the prompt
  const dismissPrompt = useCallback(() => {
    console.log('[PWA] dismissed');
    setCanShowPrompt(false);
    setInstallState('dismissed');
    recordDismissal();
  }, []);

  // Determine if we should show iOS-specific instructions
  const showIOSInstructions = Boolean(
    platform?.isIOS && canShowPrompt && !isInstalled
  );

  return {
    canShowPrompt,
    installState,
    platform,
    triggerInstall,
    dismissPrompt,
    isInstalled,
    showIOSInstructions,
  };
}
