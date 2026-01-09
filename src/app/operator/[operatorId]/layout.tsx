/**
 * Operator Layout with Dynamic Metadata
 *
 * Generates SEO metadata for operator pages.
 */

import type { Metadata } from 'next';
import { generateOperatorMetadata } from '@/lib/seo/config';

interface OperatorLayoutProps {
  children: React.ReactNode;
  params: Promise<{ operatorId: string }>;
}

export async function generateMetadata({ params }: OperatorLayoutProps): Promise<Metadata> {
  const { operatorId } = await params;
  return generateOperatorMetadata(operatorId);
}

export default function OperatorLayout({ children }: OperatorLayoutProps) {
  return children;
}
