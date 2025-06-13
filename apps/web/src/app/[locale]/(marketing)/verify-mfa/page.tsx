import VerifyMFAForm from './verify-mfa-form';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings-account');

  return {
    title: t('mfa-verification-title'),
    description: t('mfa-verification-description'),
  };
}

export default function VerifyMFAPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md">
        <VerifyMFAForm />
      </div>
    </div>
  );
}
