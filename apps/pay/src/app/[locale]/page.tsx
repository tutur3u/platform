import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

export default async function PayPage() {
  const locale = await getLocale();
  redirect({ href: '/dashboard', locale });
}
