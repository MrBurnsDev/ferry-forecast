'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthSafe } from '@/lib/auth';
import { SiteFooter, MobileMenu } from '@/components/layout';
import { SignInButtons } from '@/components/auth/SignInButtons';

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function AccountPage() {
  return <AccountPageContent />;
}

function AccountPageLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
            <MobileMenu />
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24 lg:pt-32 pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse">
              <div className="h-10 bg-secondary/50 rounded w-48 mb-8" />
              <div className="h-64 bg-secondary/50 rounded-xl" />
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function AccountPageContent() {
  const auth = useAuthSafe();
  const router = useRouter();

  // If auth context not ready, show loading
  if (!auth) {
    return <AccountPageLoading />;
  }

  const { user, isAuthenticated, isLoading, signOut, toggleBettingMode } = auth;

  if (isLoading) {
    return <AccountPageLoading />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
            <MobileMenu />
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24 lg:pt-32 pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">Account</h1>

            {isAuthenticated && user ? (
              <>
                {/* Profile Card */}
                <div className="bg-card border border-border/50 rounded-xl p-6 mb-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Profile</h2>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-2xl font-medium">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xl font-medium text-foreground">{user.username}</p>
                      <p className="text-sm text-muted-foreground">
                        Signed in with {user.provider === 'google' ? 'Google' : 'Apple'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Settings Card */}
                <div className="bg-card border border-border/50 rounded-xl p-6 mb-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Settings</h2>

                  {/* Betting Mode Toggle */}
                  <div className="flex items-center justify-between py-4 border-b border-border/30">
                    <div>
                      <p className="font-medium text-foreground">Betting Mode</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {user.bettingModeEnabled
                          ? 'Shows odds and stakes on sailings. Make predictions to compete on leaderboards.'
                          : 'Neutral prediction language. Enable to see betting odds and compete.'}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleBettingMode(!user.bettingModeEnabled)}
                      className={`relative w-14 h-8 rounded-full transition-colors flex-shrink-0 ml-4 ${
                        user.bettingModeEnabled ? 'bg-accent' : 'bg-secondary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${
                          user.bettingModeEnabled ? 'translate-x-6' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Additional settings can be added here */}
                  <div className="py-4 text-sm text-muted-foreground">
                    More settings coming soon.
                  </div>
                </div>

                {/* Sign Out */}
                <div className="bg-card border border-border/50 rounded-xl p-6">
                  <button
                    onClick={() => {
                      signOut();
                      router.push('/');
                    }}
                    className="flex items-center gap-2 text-foreground hover:text-accent transition-colors"
                  >
                    <LogOutIcon className="w-5 h-5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </>
            ) : (
              /* Not signed in */
              <div className="bg-card border border-border/50 rounded-xl p-8">
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                    <UserIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-2">Sign in to your account</h2>
                  <p className="text-muted-foreground mb-6 max-w-sm">
                    Sign in to save your predictions, compete on leaderboards, and customize your experience.
                  </p>
                  <SignInButtons />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
