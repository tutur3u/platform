import { redirect } from 'next/navigation';
import { defaultLocale } from '@/i18n/routing';

export default async function MeetWorkspacePage({
  params,
}: {
  params: Promise<{ wsId: string; locale: string }>;
}) {
  const { wsId, locale } = await params;

  redirect(`${locale === defaultLocale ? '' : `/${locale}`}/${wsId}/meetings`);
}
