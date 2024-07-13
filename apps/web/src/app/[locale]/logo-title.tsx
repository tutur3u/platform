'use client';

import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';

export default function LogoTitle({ className }: { className?: string }) {
  const params = useParams();
  const hasWorkspace = !!params.wsId;

  if (hasWorkspace) return null;
  return <div className={cn('text-2xl', className)}>Tuturuuu</div>;
}
