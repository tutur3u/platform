'use client';

import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

interface NavbarLogoLinkProps {
  logo: string;
  title: ReactNode;
  logoClassName?: string;
}

export default function NavbarLogoLink({
  logo,
  title,
  logoClassName,
}: NavbarLogoLinkProps) {
  const searchParams = useSearchParams();
  const hasNoRedirect = searchParams.get('noredirect') === '1';

  const href = hasNoRedirect ? '/' : '/home';

  return (
    <Link
      href={href}
      className={cn(
        'flex flex-none items-center gap-2 transition-opacity hover:opacity-80',
        logoClassName
      )}
    >
      <Image
        src={logo}
        className="h-8 w-8 transition-transform hover:scale-105"
        width={32}
        height={32}
        alt="logo"
      />
      {title}
    </Link>
  );
}
