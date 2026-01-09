/**
 * Region Layout with Dynamic Metadata
 *
 * Generates SEO metadata for region pages.
 */

import type { Metadata } from 'next';
import { generateRegionMetadata } from '@/lib/seo/config';

interface RegionLayoutProps {
  children: React.ReactNode;
  params: Promise<{ regionId: string }>;
}

export async function generateMetadata({ params }: RegionLayoutProps): Promise<Metadata> {
  const { regionId } = await params;
  return generateRegionMetadata(regionId);
}

export default function RegionLayout({ children }: RegionLayoutProps) {
  return children;
}
