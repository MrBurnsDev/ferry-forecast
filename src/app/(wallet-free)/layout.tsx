import Script from 'next/script';
import { walletBlockerScript } from '@/components/wallet';

/**
 * Wallet-Free Layout
 *
 * This layout applies to routes that should NOT have wallet extension interference:
 * - /account
 * - /auth/*
 * - /privacy
 * - /terms
 * - /about
 *
 * The wallet blocker script runs before any extensions can initialize,
 * preventing MetaMask, Core, Backpack, etc. from fighting over window.ethereum.
 */
export default function WalletFreeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Block wallet extensions before they can initialize */}
      <Script
        id="wallet-blocker"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: walletBlockerScript }}
      />
      {children}
    </>
  );
}
