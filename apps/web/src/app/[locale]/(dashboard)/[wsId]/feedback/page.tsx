import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getFeedbackStaffIdentity } from '@/lib/product-feedback-staff';
import { FeedbackInbox } from './feedback-inbox';

export default async function FeedbackPage() {
  await connection();
  const actor = await getFeedbackStaffIdentity();
  const t = await getTranslations('product-feedback');
  if (!actor) return <p role="alert">{t('unavailable')}</p>;
  return (
    <FeedbackInbox
      key={actor}
      actor={actor}
      mediaEnabled={process.env.PRODUCT_FEEDBACK_MEDIA_ENABLED === 'true'}
    />
  );
}
