import SubmissionsList from './submissions-list';
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('nova');

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('submissions')}</h1>
      </div>

      <SubmissionsList />
    </div>
  );
}
