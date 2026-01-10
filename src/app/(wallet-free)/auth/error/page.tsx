'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function AuthErrorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'An unknown error occurred';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center pt-24 pb-12">
        <div className="max-w-md mx-auto p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertIcon className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Sign In Problem
          </h1>
          <p className="text-muted-foreground mb-6">
            {error}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push('/account')}
              className="px-6 py-2 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2 bg-secondary text-foreground rounded-lg font-medium hover:bg-secondary/90 transition-colors"
            >
              Return Home
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
}
