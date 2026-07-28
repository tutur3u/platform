import { redirect } from '@/i18n/navigation';

export default async function GitHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/tutur3u/platform', locale });
}
