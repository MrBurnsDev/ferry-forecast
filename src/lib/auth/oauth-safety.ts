'use client';

/**
 * OAuth Safety Detection
 *
 * Detects environments where Google OAuth will fail with 403 disallowed_useragent.
 *
 * Google's "Use secure browsers" policy blocks OAuth in:
 * - iOS/iPadOS standalone PWAs (Add to Home Screen)
 * - In-app browsers (Facebook, Instagram, Gmail, Twitter, etc.)
 * - Embedded WebViews
 *
 * This module provides detection and should be used to block OAuth attempts
 * BEFORE they reach Google, preventing users from seeing the 403 error.
 *
 * References:
 * - https://developers.google.com/identity/protocols/oauth2/policies
 * - https://developers.googleblog.com/2016/08/modernizing-oauth-interactions-in-native-apps.html
 */

export interface OAuthSafetyResult {
  /** True if Google OAuth can proceed safely */
  isSafe: boolean;

  /** True if running on iOS or iPadOS */
  isIOS: boolean;

  /** True if running as standalone PWA (Add to Home Screen) */
  isStandalone: boolean;

  /** True if running in an in-app browser */
  isInAppBrowser: boolean;

  /** Name of detected in-app browser, if any */
  inAppBrowserName: string | null;

  /** Human-readable reason why OAuth is blocked */
  blockReason: string | null;
}

/**
 * Detects if the current environment supports Google OAuth.
 *
 * Call this BEFORE initiating OAuth. If isSafe is false, show
 * the blocking modal instead of attempting Google sign-in.
 */
export function detectOAuthSafety(): OAuthSafetyResult {
  // Server-side rendering - assume safe (will re-check on client)
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isSafe: true,
      isIOS: false,
      isStandalone: false,
      isInAppBrowser: false,
      inAppBrowserName: null,
      blockReason: null,
    };
  }

  const ua = navigator.userAgent || '';

  // ============================================================
  // 1. DETECT iOS / iPadOS
  // ============================================================
  // iPadOS 13+ reports as Mac in userAgent, so we also check for touch
  const isIPhone = /iPhone/i.test(ua);
  const isIPad = /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOS = isIPhone || isIPad;

  // ============================================================
  // 2. DETECT STANDALONE PWA (Add to Home Screen)
  // ============================================================
  // @ts-expect-error - standalone is a non-standard Safari property
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  // ============================================================
  // 3. DETECT IN-APP BROWSERS
  // ============================================================
  // These browsers embed WebViews that Google blocks
  const inAppBrowserPatterns: { pattern: RegExp; name: string }[] = [
    // Facebook
    { pattern: /FBAN|FBAV|FB_IAB|FBIOS|FBSS/i, name: 'Facebook' },
    // Instagram
    { pattern: /Instagram/i, name: 'Instagram' },
    // Twitter / X
    { pattern: /Twitter|X-Client/i, name: 'Twitter' },
    // LinkedIn
    { pattern: /LinkedIn/i, name: 'LinkedIn' },
    // Snapchat
    { pattern: /Snapchat/i, name: 'Snapchat' },
    // TikTok
    { pattern: /TikTok|BytedanceWebview|ByteLocale/i, name: 'TikTok' },
    // Pinterest
    { pattern: /Pinterest/i, name: 'Pinterest' },
    // WhatsApp
    { pattern: /WhatsApp/i, name: 'WhatsApp' },
    // Telegram
    { pattern: /TelegramBot/i, name: 'Telegram' },
    // LINE
    { pattern: /\bLine\//i, name: 'LINE' },
    // WeChat
    { pattern: /MicroMessenger|WeChat/i, name: 'WeChat' },
    // Gmail app
    { pattern: /GSA\//i, name: 'Gmail' },
    // Google app
    { pattern: /\bGoogleApp\b/i, name: 'Google App' },
    // Generic iOS WebView indicators
    { pattern: /\bwv\b|WebView/i, name: 'WebView' },
  ];

  let inAppBrowserName: string | null = null;
  for (const { pattern, name } of inAppBrowserPatterns) {
    if (pattern.test(ua)) {
      inAppBrowserName = name;
      break;
    }
  }

  // Additional iOS-specific WebView detection
  // Real Safari has "Safari" in UA, WebViews typically don't
  const isSafariLike = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
  const isIOSWebView = isIOS && !isSafariLike && !inAppBrowserName;

  if (isIOSWebView) {
    inAppBrowserName = 'In-App Browser';
  }

  const isInAppBrowser = inAppBrowserName !== null;

  // ============================================================
  // 4. DETERMINE IF OAUTH IS SAFE
  // ============================================================
  let blockReason: string | null = null;

  // Block: iOS standalone PWA
  if (isIOS && isStandalone) {
    blockReason = 'Google sign-in is not available from the home screen app. Please open this site in Safari.';
  }
  // Block: In-app browser on iOS
  else if (isIOS && isInAppBrowser) {
    blockReason = `Google sign-in is not available in ${inAppBrowserName}. Please open this site in Safari.`;
  }
  // Block: In-app browser on any platform (Google blocks these too)
  else if (isInAppBrowser) {
    blockReason = `Google sign-in is not available in ${inAppBrowserName}. Please open this site in your regular browser.`;
  }

  const isSafe = blockReason === null;

  return {
    isSafe,
    isIOS,
    isStandalone,
    isInAppBrowser,
    inAppBrowserName,
    blockReason,
  };
}

/**
 * React hook for OAuth safety detection.
 * Re-runs detection on mount to handle client-side hydration.
 */
import { useState, useEffect } from 'react';

export function useOAuthSafety(): OAuthSafetyResult {
  const [result, setResult] = useState<OAuthSafetyResult>(() => detectOAuthSafety());

  useEffect(() => {
    // Re-detect on client after hydration
    setResult(detectOAuthSafety());
  }, []);

  return result;
}

/**
 * Get the canonical URL to copy for users who need to open in Safari
 */
export function getCanonicalUrl(): string {
  if (typeof window !== 'undefined') {
    // Return current path on canonical domain
    return `https://www.istheferryrunning.com${window.location.pathname}`;
  }
  return 'https://www.istheferryrunning.com';
}
