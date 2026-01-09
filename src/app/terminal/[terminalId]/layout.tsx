/**
 * Terminal Layout with Dynamic Metadata
 *
 * Generates SEO metadata for terminal pages.
 */

import type { Metadata } from 'next';
import { generateTerminalMetadata } from '@/lib/seo/config';

interface TerminalLayoutProps {
  children: React.ReactNode;
  params: Promise<{ terminalId: string }>;
}

export async function generateMetadata({ params }: TerminalLayoutProps): Promise<Metadata> {
  const { terminalId } = await params;
  return generateTerminalMetadata(terminalId);
}

export default function TerminalLayout({ children }: TerminalLayoutProps) {
  return children;
}
