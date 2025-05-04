'use client';

import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

export default function LinkButton({
  href,
  title,
  icon,
  className,
  disabled,
}: {
  href: string;
  title: ReactNode;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const pathname = usePathname();

  if (href === pathname || disabled)
    return (
      <Button
        type="button"
        variant="secondary"
        className={cn('border font-semibold max-md:w-full', className)}
        disabled
      >
        {icon}
        {title}
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
        {icon}
        {title}
      </Button>
    </Link>
  );
}