import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShareButtons } from '@/components/social';
import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

/**
 * Daily Win Page
 *
 * Public, read-only page showing a user's daily crown achievement.
 * No authentication required.
 */

// Minimum bet requirement for daily crown
const MIN_BETS_DAILY = 2;

interface PageProps {
  params: { date: string; username: string };
}

// Generate dynamic metadata for OG tags
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date, username } = params;
  const baseUrl = 'https://www.istheferryrunning.com';

  // Format date for display
  const dateObj = new Date(date + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    title: `${username} took the Ferry Crown on ${formattedDate}`,
    description: `${username} topped the ferry prediction leaderboard on IsTheFerryRunning.com on ${formattedDate}.`,
    openGraph: {
      title: 'I took the ferry crown today 👑',
      description: 'I topped the ferry prediction leaderboard on IsTheFerryRunning.com',
      url: `${baseUrl}/win/daily/${date}/${username}`,
      type: 'website',
      images: [
        {
          url: `${baseUrl}/og/wins/daily/${date}/${username}.png`,
          width: 1200,
          height: 630,
          alt: `${username}'s Ferry Crown - ${formattedDate}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'I took the ferry crown today 👑',
      description: 'I topped the ferry prediction leaderboard on IsTheFerryRunning.com',
      images: [`${baseUrl}/og/wins/daily/${date}/${username}.png`],
    },
  };
}

async function getDailyWinData(date: string, username: string) {
  const supabase = createServiceRoleClient({ allowNull: true });
  if (!supabase) return null;

  // Get user data
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', username)
    .single();

  if (userError || !user) return null;

  // Get bets for that date
  const { data: bets, error: betsError } = await supabase
    .from('bets')
    .select('*')
    .eq('user_id', user.id)
    .gte('resolved_at', `${date}T00:00:00Z`)
    .lt('resolved_at', `${date}T23:59:59Z`);

  if (betsError) return null;

  const resolvedBets = (bets || []).filter(
    (b) => b.status === 'won' || b.status === 'lost'
  );
  const wonBets = (bets || []).filter((b) => b.status === 'won');

  const dailyProfit = (bets || []).reduce((sum, b) => {
    if (b.status === 'won') return sum + (b.payout_points - b.stake_points);
    if (b.status === 'lost') return sum - b.stake_points;
    return sum;
  }, 0);

  return {
    username: user.username,
    date,
    dailyProfit,
    betsToday: resolvedBets.length,
    winsToday: wonBets.length,
    lossesToday: resolvedBets.length - wonBets.length,
    winRateToday:
      resolvedBets.length > 0
        ? Math.round((100 * wonBets.length) / resolvedBets.length)
        : 0,
    isQualified: resolvedBets.length >= MIN_BETS_DAILY,
  };
}

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

export default async function DailyWinPage({ params }: PageProps) {
  const { date, username } = params;

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    notFound();
  }

  const winData = await getDailyWinData(date, username);

  if (!winData || !winData.isQualified) {
    notFound();
  }

  // Format date for display
  const dateObj = new Date(date + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const pageUrl = `https://www.istheferryrunning.com/win/daily/${date}/${username}`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50 fixed-nav-safe">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 pt-24 lg:pt-32 pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-2xl mx-auto">
            {/* Crown Card */}
            <div className="bg-gradient-to-b from-card to-secondary/50 rounded-2xl border border-border/50 p-8 lg:p-12 text-center mb-8 shadow-xl">
              {/* Crown Icon */}
              <div className="text-8xl lg:text-9xl mb-6 drop-shadow-lg">👑</div>

              {/* Username */}
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-2 uppercase tracking-wide">
                {winData.username}
              </h1>

              {/* Title */}
              <p className="text-xl lg:text-2xl text-accent font-medium mb-4">
                Took the Ferry Crown
              </p>

              {/* Date */}
              <p className="text-lg text-muted-foreground mb-8">{formattedDate}</p>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-background/50 rounded-lg p-4">
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">
                    {winData.dailyProfit > 0 ? '+' : ''}
                    {winData.dailyProfit}
                  </p>
                  <p className="text-sm text-muted-foreground">Daily Profit</p>
                </div>
                <div className="bg-background/50 rounded-lg p-4">
                  <p className="text-2xl lg:text-3xl font-bold text-success">
                    {winData.winsToday}
                  </p>
                  <p className="text-sm text-muted-foreground">Wins</p>
                </div>
                <div className="bg-background/50 rounded-lg p-4">
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">
                    {winData.winRateToday}%
                  </p>
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                </div>
              </div>

              {/* Share Buttons */}
              <div className="flex justify-center">
                <ShareButtons
                  url={pageUrl}
                  title={`${winData.username} took the Ferry Crown on ${formattedDate}!`}
                />
              </div>
            </div>

            {/* CTA */}
            <div className="text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-colors"
              >
                <WavesIcon className="w-5 h-5" />
                Is the Ferry Running?
              </Link>
              <p className="mt-4 text-sm text-muted-foreground">
                Check ferry delay and cancellation forecasts
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 bg-secondary border-t border-border/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              <WavesIcon className="w-6 h-6 text-accent" />
              <span className="font-semibold text-foreground">Is the Ferry Running?</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Not affiliated with any ferry operator.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
