'use client';

import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';

export default function LogoTitle({
  forceShow = false,
  className,
}: {
  forceShow?: boolean;
  className?: string;
}) {
  const params = useParams();
  const hasWorkspace = !!params.wsId;

  if (!forceShow && hasWorkspace) return null;
  return <div className={cn('text-2xl', className)}>Neo Culture Tech</div>;
}
