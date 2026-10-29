'use client';

import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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
  const pathname = usePathname();
  const legalChanges = /\/legal\/changes(?:\/full)?\/?$/u.test(pathname);
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
      {legalChanges ? (
        <>
          {/* The wordmark follows the theme: dark ink on light, white on dark. */}
          <Image
            src="/media/branding/brand-mark-light.svg"
            className="h-6 w-auto dark:hidden"
            width={111}
            height={24}
            alt="Tuturuuu"
          />
          <Image
            src="/media/branding/brand-mark-dark.svg"
            className="hidden h-6 w-auto dark:block"
            width={111}
            height={24}
            alt="Tuturuuu"
          />
        </>
      ) : (
        <Image
          src={logo}
          className="h-8 w-8 transition-transform hover:scale-105"
          width={32}
          height={32}
          alt="logo"
        />
      )}
      {legalChanges ? null : title}
    </Link>
  );
}
