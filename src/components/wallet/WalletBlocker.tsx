'use client';

/**
 * WalletBlocker - Prevents wallet extensions from fighting over window.ethereum
 *
 * This component injects a script that runs before wallet extensions can initialize.
 * It freezes window.ethereum as an empty proxy object, preventing extensions like
 * MetaMask, Core, Backpack, D3fenders from fighting over it and crashing the page.
 *
 * Use this on routes that don't need wallet functionality (auth, static pages).
 */

import { useEffect } from 'react';

// This script runs synchronously to beat extension injection
const BLOCKER_SCRIPT = `
(function() {
  if (window.__walletBlocked) return;
  window.__walletBlocked = true;

  // Create a frozen proxy that silently absorbs all wallet operations
  const blockedEthereum = new Proxy({}, {
    get: function(target, prop) {
      // Return no-op functions for common methods
      if (prop === 'request') return function() { return Promise.reject(new Error('Wallet blocked on this page')); };
      if (prop === 'on') return function() {};
      if (prop === 'removeListener') return function() {};
      if (prop === 'isMetaMask') return false;
      if (prop === 'isConnected') return function() { return false; };
      return undefined;
    },
    set: function() {
      // Prevent any writes
      return true;
    },
    defineProperty: function() {
      // Prevent property definitions
      return true;
    }
  });

  // Freeze the proxy to prevent modifications
  Object.freeze(blockedEthereum);

  // Define window.ethereum as non-configurable, non-writable
  try {
    Object.defineProperty(window, 'ethereum', {
      value: blockedEthereum,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } catch (e) {
    // If ethereum already exists, try to freeze it in place
    if (window.ethereum) {
      try {
        Object.freeze(window.ethereum);
      } catch (freezeErr) {
        // Extension already has control, nothing we can do
      }
    }
  }

  // Also block common wallet injection points
  ['solana', 'phantom', 'solflare', 'backpack'].forEach(function(key) {
    try {
      Object.defineProperty(window, key, {
        value: undefined,
        writable: false,
        configurable: false
      });
    } catch (e) {}
  });
})();
`;

export function WalletBlocker() {
  // Inject the blocker script as early as possible
  useEffect(() => {
    // The script in head runs first, but this is a backup
    try {
      const script = document.createElement('script');
      script.textContent = BLOCKER_SCRIPT;
      document.head.insertBefore(script, document.head.firstChild);
    } catch {
      // Silent fail - the head script should have already run
    }
  }, []);

  return null;
}

/**
 * Inline script for head injection (runs before any extensions)
 * Use this with next/script strategy="beforeInteractive"
 */
export const walletBlockerScript = BLOCKER_SCRIPT;
