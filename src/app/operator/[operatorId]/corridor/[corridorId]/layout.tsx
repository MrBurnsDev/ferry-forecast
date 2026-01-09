/**
 * Corridor Layout with Dynamic Metadata
 *
 * Generates SEO metadata for corridor pages.
 */

import type { Metadata } from 'next';
import { generateCorridorMetadata, OPERATOR_SEO } from '@/lib/seo/config';

interface CorridorLayoutProps {
  children: React.ReactNode;
  params: Promise<{ operatorId: string; corridorId: string }>;
}

export async function generateMetadata({ params }: CorridorLayoutProps): Promise<Metadata> {
  const { operatorId, corridorId } = await params;
  const operatorConfig = OPERATOR_SEO[operatorId];
  const operatorName = operatorConfig?.displayName;
  return generateCorridorMetadata(corridorId, operatorName);
}

export default function CorridorLayout({ children }: CorridorLayoutProps) {
  return children;
}
