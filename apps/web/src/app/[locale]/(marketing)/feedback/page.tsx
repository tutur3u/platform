import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { FeedbackForm } from './feedback-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('productFeedback');
  return { title: t('heading'), robots: NO_INDEX_ROBOTS };
}

export default async function FeedbackPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect('/login?returnUrl=%2Ffeedback');
  const t = await getTranslations('productFeedback');
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-16 md:py-24">
      <h1 className="font-semibold text-2xl tracking-tight">{t('heading')}</h1>
      {process.env.PRODUCT_FEEDBACK_SUBMISSION_ENABLED === 'true' ? (
        <FeedbackForm
          key={user.id}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        />
      ) : (
        <p role="alert">{t('unavailable')}</p>
      )}
    </main>
  );
}
