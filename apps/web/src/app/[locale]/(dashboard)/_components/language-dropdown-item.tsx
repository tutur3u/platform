'use client';

import { DropdownMenuItem } from '@tutur3u/ui/dropdown-menu';
import { Check, Hexagon } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  label: string;
  locale: string;
  selected?: boolean;
}

export function LanguageDropdownItem({ label, locale, selected }: Props) {
  const router = useRouter();

  const useLocale = async () => {
    const res = await fetch('/api/v1/infrastructure/languages', {
      method: 'POST',
      body: JSON.stringify({ locale }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) router.refresh();
  };

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={useLocale}
      disabled={selected}
    >
      {selected ? (
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <Hexagon className="mr-2 h-4 w-4" />
      )}
      {label}
    </DropdownMenuItem>
  );
}
