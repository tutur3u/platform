import { redirect } from '@/i18n/navigation';

export default async function PayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/dashboard', locale });
}
