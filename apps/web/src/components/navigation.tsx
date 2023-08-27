'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface NavLink {
  name: string;
  href: string;
  matchExact?: boolean;
}

interface Props {
  navLinks: NavLink[];
}

export function Navigation({ navLinks }: Props) {
  const pathname = usePathname();

  return (
    <>
      {navLinks.map((link) => {
        const isActive = link?.matchExact
          ? pathname === link.href
          : pathname?.startsWith(link.href) ?? false;

        return (
          <Link
            className={`${
              isActive
                ? 'text-foreground bg-foreground/10 hover:bg-foreground/5'
                : 'text-foreground/30 hover:text-foreground'
            } rounded-full px-3 py-1 transition duration-300`}
            href={link.href}
            key={link.name}
          >
            {link.name}
          </Link>
        );
      })}
    </>
  );
}
