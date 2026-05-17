import { redirect } from '@/i18n/navigation';

export default async function IndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  redirect({ href: '/dashboard', locale });
}
