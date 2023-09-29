'use client';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useRouter, usePathname } from 'next/navigation';

interface Props {
  label: string;
  lang: string;
}

export function LanguageDropdownItem({ label, lang }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={() => router.replace(`${pathname}?lang=${lang}`)}
    >
      {label}
    </DropdownMenuItem>
  );
}
