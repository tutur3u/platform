'use client';

import { DEV_MODE } from '@/constants/common';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@tuturuuu/ui/dropdown-menu';
import { CalendarClock } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function MeetTogetherMenuItem() {
  const t = useTranslations('common');

  return (
    <>
      <DropdownMenuGroup>
        <Link
          href={`${
            DEV_MODE
              ? `http://localhost:7803/meet-together`
              : `https://calendar.tuturuuu.com/meet-together`
          }`}
        >
          <DropdownMenuItem className="cursor-pointer">
            <CalendarClock className="mr-2 h-4 w-4" />
            <span>{t('meet-together')}</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuGroup>
    </>
  );
}
