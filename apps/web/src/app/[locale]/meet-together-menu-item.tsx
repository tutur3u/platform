'use client';

import { CalendarClock } from '@tuturuuu/icons';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function MeetTogetherMenuItem() {
  const t = useTranslations('common');
  const pathname = usePathname();

  return (
    <DropdownMenuGroup>
      {pathname === `/meet-together` ? (
        <DropdownMenuItem disabled>
          <CalendarClock className="h-4 w-4 text-dynamic-pink" />
          <span>{t('meet-together')}</span>
        </DropdownMenuItem>
      ) : (
        <Link href="/meet-together">
          <DropdownMenuItem className="cursor-pointer">
            <CalendarClock className="h-4 w-4 text-dynamic-pink" />
            <span>{t('meet-together')}</span>
          </DropdownMenuItem>
        </Link>
      )}
    </DropdownMenuGroup>
  );
}
