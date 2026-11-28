import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getFeedbackStaffIdentity } from '@/lib/product-feedback-staff';
import { ChatReportsInbox } from './chat-reports-inbox';

export default async function ChatReportsPage() {
  await connection();
  const actor = await getFeedbackStaffIdentity();
  const t = await getTranslations('chat-reports');
  if (!actor) return <p role="alert">{t('unavailable')}</p>;
  return <ChatReportsInbox key={actor} actor={actor} />;
}
