'use client';

import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@tuturuuu/ui/dropdown-menu';
import { CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MeetTogetherMenuItem() {
  const t = useTranslations('common');
  const pathname = usePathname();

  return (
    <>
      <DropdownMenuGroup>
        {pathname === `/meet-together` ? (
          <DropdownMenuItem disabled>
            <CalendarClock className="mr-2 h-4 w-4" />
            <span>{t('meet-together')}</span>
          </DropdownMenuItem>
        ) : (
          <Link href="/meet-together">
            <DropdownMenuItem className="cursor-pointer">
              <CalendarClock className="mr-2 h-4 w-4" />
              <span>{t('meet-together')}</span>
            </DropdownMenuItem>
          </Link>
        )}
      </DropdownMenuGroup>
    </>
  );
}
