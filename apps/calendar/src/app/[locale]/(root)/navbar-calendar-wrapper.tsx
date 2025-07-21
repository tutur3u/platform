'use client';

import NavbarCalendarHeader from './navbar-calendar-header';
import { useLocale } from 'next-intl';

export default function NavbarCalendarWrapper() {
  const locale = useLocale();
  return <NavbarCalendarHeader locale={locale} />;
}
