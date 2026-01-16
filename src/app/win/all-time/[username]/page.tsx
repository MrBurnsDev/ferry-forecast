import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShareButtons } from '@/components/social';
import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

/**
 * All-Time Win Page
 *
 * Public, read-only page showing the all-time leaderboard leader.
 * No authentication required.
 */

// Minimum bet requirement for all-time leaderboard
const MIN_BETS_ALL_TIME = 10;

interface PageProps {
  params: { username: string };
}

// Generate dynamic metadata for OG tags
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = params;
  const baseUrl = 'https://www.istheferryrunning.com';

  return {
    title: `${username} - All-Time Ferry Crown Leader`,
    description: `${username} leads the all-time ferry prediction leaderboard on IsTheFerryRunning.com.`,
    openGraph: {
      title: 'I lead the all-time ferry leaderboard 👑',
      description: 'I topped the ferry prediction leaderboard on IsTheFerryRunning.com',
      url: `${baseUrl}/win/all-time/${username}`,
      type: 'website',
      images: [
        {
          url: `${baseUrl}/og/wins/all-time/${username}.png`,
          width: 1200,
          height: 630,
          alt: `${username} - All-Time Ferry Crown Leader`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'I lead the all-time ferry leaderboard 👑',
      description: 'I topped the ferry prediction leaderboard on IsTheFerryRunning.com',
      images: [`${baseUrl}/og/wins/all-time/${username}.png`],
    },
  };
}

async function getAllTimeWinData(username: string) {
  const supabase = createServiceRoleClient({ allowNull: true });
  if (!supabase) return null;

  // Get leaderboard data
  const { data, error } = await supabase
    .from('leaderboard_all_time')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !data) return null;

  // Verify this user is the leader
  const { data: topUsers } = await supabase
    .from('leaderboard_all_time')
    .select('username, all_time_profit, total_bets')
    .order('all_time_profit', { ascending: false })
    .limit(1);

  if (!topUsers || topUsers.length === 0) return null;
  if (topUsers[0].username !== username) return null;
  if (topUsers[0].total_bets < MIN_BETS_ALL_TIME) return null;

  return {
    username: data.username,
    allTimeProfit: data.all_time_profit,
    totalBets: data.total_bets,
    totalWins: data.total_wins,
    winRate: data.win_rate,
    roi: data.roi,
    isQualified: data.total_bets >= MIN_BETS_ALL_TIME,
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

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

export default async function AllTimeWinPage({ params }: PageProps) {
  const { username } = params;

  const winData = await getAllTimeWinData(username);

  if (!winData || !winData.isQualified) {
    notFound();
  }

  const pageUrl = `https://www.istheferryrunning.com/win/all-time/${username}`;

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
                All-Time Ferry Crown Leader
              </p>

              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/30 mb-8">
                <TrophyIcon className="w-5 h-5 text-accent" />
                <span className="text-accent font-medium">Top of the Leaderboard</span>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-background/50 rounded-lg p-4">
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">
                    {winData.allTimeProfit > 0 ? '+' : ''}
                    {winData.allTimeProfit}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Profit</p>
                </div>
                <div className="bg-background/50 rounded-lg p-4">
                  <p className="text-2xl lg:text-3xl font-bold text-success">
                    {winData.totalWins}
                  </p>
                  <p className="text-sm text-muted-foreground">Wins</p>
                </div>
                <div className="bg-background/50 rounded-lg p-4">
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">
                    {winData.winRate}%
                  </p>
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                </div>
                <div className="bg-background/50 rounded-lg p-4">
                  <p className="text-2xl lg:text-3xl font-bold text-foreground">
                    {winData.roi > 0 ? '+' : ''}
                    {winData.roi}%
                  </p>
                  <p className="text-sm text-muted-foreground">ROI</p>
                </div>
              </div>

              {/* Share Buttons */}
              <div className="flex justify-center">
                <ShareButtons
                  url={pageUrl}
                  title={`${winData.username} leads the all-time Ferry Crown leaderboard!`}
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
