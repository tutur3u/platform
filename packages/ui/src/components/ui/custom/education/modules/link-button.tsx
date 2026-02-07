'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function LinkButton({
  href,
  title,
  icon,
  className,
  disabled,
  badge,
}: {
  href: string;
  title: ReactNode;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
  badge?: number;
}) {
  const pathname = usePathname();

  const content = (
    <>
      {icon}
      {title}
      {badge !== undefined && badge > 0 && (
        <Badge
          variant="destructive"
          className="ml-1 h-5 min-w-5 justify-center px-1.5 text-xs"
        >
          {badge > 99 ? '99+' : badge}
        </Badge>
      )}
    </>
  );

  if (href === pathname || disabled)
    return (
      <Button
        type="button"
        variant="secondary"
        className={cn('border font-semibold max-md:w-full', className)}
        disabled
      >
        {content}
      </Button>
    );

  return (
    <Link href={href}>
      <Button
        type="button"
        variant="secondary"
        className={cn('border font-semibold max-md:w-full', className)}
        disabled={disabled}
      >
        {content}
      </Button>
    </Link>
  );
}
