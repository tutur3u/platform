import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { isCurrentUserAIWhitelisted } from '@/lib/ai-whitelist';

export default async function NotWhitelistedPage() {
  await connection();

  const t = await getTranslations();

  const user = await getSatelliteAppSessionUser('rewise');
  if (!user?.email) redirect('/login');

  if (await isCurrentUserAIWhitelisted()) redirect('/');

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col items-center justify-center p-4 text-center md:p-8 lg:p-16">
      <h1 className="font-bold text-xl">{t('common.not_whitelisted')}</h1>
      <p className="text-balance opacity-70">
        {t('common.not_whitelisted_desc')}
      </p>
    </div>
  );
}
