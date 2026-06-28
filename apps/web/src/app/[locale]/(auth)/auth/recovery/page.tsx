import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthRecoveryForm } from './recovery-form';

export const metadata: Metadata = {
  title: 'Account Recovery',
  description: 'Recover access to your Tuturuuu account with a support email.',
};

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    diagnostic?: string;
    email?: string;
    error?: string;
    next?: string;
  }>;
}

export default async function AuthRecoveryPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations('auth-recovery');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="font-semibold text-2xl tracking-normal">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {t('description')}
          </p>
        </div>
        <AuthRecoveryForm
          defaultEmail={sp.email ?? ''}
          diagnosticCode={sp.diagnostic}
          error={sp.error}
          locale={locale}
          next={sp.next}
        />
      </section>
    </main>
  );
}
