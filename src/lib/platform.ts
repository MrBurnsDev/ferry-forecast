/**
 * Platform Detection Utilities for PWA
 *
 * Detects device type, browser, and PWA installation status.
 * Used to show appropriate "Add to Home Screen" prompts.
 */

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown';
export type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other';

export interface PlatformInfo {
  platform: Platform;
  browser: Browser;
  isMobile: boolean;
  isStandalone: boolean;
  supportsInstallPrompt: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}

/**
 * Detect the current platform (iOS, Android, Desktop)
 */
export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';

  const ua = navigator.userAgent.toLowerCase();

  // iOS detection (iPhone, iPad, iPod)
  if (/iphone|ipad|ipod/.test(ua)) {
    return 'ios';
  }

  // Android detection
  if (/android/.test(ua)) {
    return 'android';
  }

  // Desktop detection
  if (/windows|macintosh|linux/.test(ua) && !/mobile/.test(ua)) {
    return 'desktop';
  }

  return 'unknown';
}

/**
 * Detect the current browser
 */
export function detectBrowser(): Browser {
  if (typeof window === 'undefined') return 'other';

  const ua = navigator.userAgent.toLowerCase();

  // Samsung Internet
  if (/samsungbrowser/.test(ua)) {
    return 'samsung';
  }

  // Edge
  if (/edg/.test(ua)) {
    return 'edge';
  }

  // Chrome (must check after Edge since Edge includes "Chrome")
  if (/chrome/.test(ua) && !/edg/.test(ua)) {
    return 'chrome';
  }

  // Firefox
  if (/firefox/.test(ua)) {
    return 'firefox';
  }

  // Safari (must check after Chrome since some browsers include "Safari")
  if (/safari/.test(ua) && !/chrome/.test(ua)) {
    return 'safari';
  }

  return 'other';
}

/**
 * Check if running as a standalone PWA (added to home screen)
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // Check display-mode media query (modern browsers)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // Check iOS standalone mode
  if ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) {
    return true;
  }

  // Check if launched from home screen on Android
  if (document.referrer.includes('android-app://')) {
    return true;
  }

  return false;
}

/**
 * Check if the browser supports the beforeinstallprompt event
 * (Chrome/Edge on Android, Chrome on desktop)
 */
export function supportsInstallPrompt(): boolean {
  if (typeof window === 'undefined') return false;

  // beforeinstallprompt is only supported on Chromium-based browsers
  // on platforms that support PWA installation
  const platform = detectPlatform();
  const browser = detectBrowser();

  // iOS Safari does NOT support beforeinstallprompt
  if (platform === 'ios') {
    return false;
  }

  // Android Chrome/Edge/Samsung support it
  if (platform === 'android' && ['chrome', 'edge', 'samsung'].includes(browser)) {
    return true;
  }

  // Desktop Chrome/Edge support it
  if (platform === 'desktop' && ['chrome', 'edge'].includes(browser)) {
    return true;
  }

  return false;
}

/**
 * Check if device is mobile
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;

  const platform = detectPlatform();
  return platform === 'ios' || platform === 'android';
}

/**
 * Get comprehensive platform information
 */
export function getPlatformInfo(): PlatformInfo {
  const platform = detectPlatform();
  const browser = detectBrowser();

  return {
    platform,
    browser,
    isMobile: isMobile(),
    isStandalone: isStandalone(),
    supportsInstallPrompt: supportsInstallPrompt(),
    isIOS: platform === 'ios',
    isAndroid: platform === 'android',
  };
}

/**
 * Storage keys for PWA prompt state
 */
export const PWA_STORAGE_KEYS = {
  DISMISSED_AT: 'pwa_prompt_dismissed_at',
  INSTALL_COUNT: 'pwa_install_prompt_count',
  LAST_SHOWN: 'pwa_prompt_last_shown',
} as const;

/**
 * Check if the PWA prompt should be shown based on dismissal state
 * Returns false if dismissed within the last 30 days
 */
export function shouldShowPrompt(): boolean {
  if (typeof window === 'undefined') return false;

  // Don't show if already installed
  if (isStandalone()) {
    return false;
  }

  // Don't show on desktop
  if (!isMobile()) {
    return false;
  }

  // Check if dismissed recently
  const dismissedAt = localStorage.getItem(PWA_STORAGE_KEYS.DISMISSED_AT);
  if (dismissedAt) {
    const dismissedDate = new Date(dismissedAt);
    const daysSinceDismissal = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);

    // Don't show for 30 days after dismissal
    if (daysSinceDismissal < 30) {
      return false;
    }
  }

  return true;
}

/**
 * Record that the user dismissed the prompt
 */
export function recordDismissal(): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(PWA_STORAGE_KEYS.DISMISSED_AT, new Date().toISOString());
}

/**
 * Record that the prompt was shown
 */
export function recordPromptShown(): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(PWA_STORAGE_KEYS.LAST_SHOWN, new Date().toISOString());

  const count = parseInt(localStorage.getItem(PWA_STORAGE_KEYS.INSTALL_COUNT) || '0', 10);
  localStorage.setItem(PWA_STORAGE_KEYS.INSTALL_COUNT, String(count + 1));
}
