/**
 * Standalone Corridor Layout with Dynamic Metadata
 *
 * Generates SEO metadata for standalone corridor pages.
 */

import type { Metadata } from 'next';
import { generateCorridorMetadata } from '@/lib/seo/config';

interface CorridorLayoutProps {
  children: React.ReactNode;
  params: Promise<{ corridorId: string }>;
}

export async function generateMetadata({ params }: CorridorLayoutProps): Promise<Metadata> {
  const { corridorId } = await params;
  return generateCorridorMetadata(corridorId);
}

export default function CorridorLayout({ children }: CorridorLayoutProps) {
  return children;
}
