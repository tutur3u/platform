'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function GetStartedButton() {
  const pathname = usePathname();

  if (pathname === '/login') return null;

  return (
    <Link
      href="/login"
      className="border-foreground/10 bg-foreground/10 hover:bg-foreground/5 rounded-full border px-4 py-1 transition duration-300"
    >
      Get started
    </Link>
  );
}
