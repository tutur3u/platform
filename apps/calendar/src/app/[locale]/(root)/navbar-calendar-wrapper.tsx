'use client';

import { useLocale } from 'next-intl';
import NavbarCalendarHeader from './navbar-calendar-header';

export default function NavbarCalendarWrapper() {
  const locale = useLocale();
  return <NavbarCalendarHeader locale={locale} />;
}
