'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface NavLink {
  name: string;
  href: string;
  matchExact?: boolean;
  aliases?: string[];
  disabled?: boolean;
}

interface Props {
  navLinks: NavLink[];
}

export function Navigation({ navLinks }: Props) {
  const pathname = usePathname();

  return (
    <>
      {navLinks.map((link) => {
        if (link?.disabled) return null;

        const links = [...(link.aliases || []), link.href];
        const matchExact = link.matchExact ?? false;

        const isActive =
          links
            .map((href) =>
              matchExact
                ? pathname === href
                : pathname?.startsWith(href) ?? false
            )
            .filter(Boolean).length > 0;

        return (
          <Link
            className={`${
              isActive
                ? 'text-foreground border-foreground/10 bg-foreground/10'
                : 'text-foreground/30 hover:text-foreground hover:border-foreground/5 hover:bg-foreground/5 border-transparent'
            } rounded-full border px-3 py-1 transition duration-300`}
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
