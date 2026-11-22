import type { Metadata } from 'next';
import { AuthRecoveryView } from './recovery-view';

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
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="flex w-full max-w-[400px] flex-col gap-4">
        <AuthRecoveryView
          defaultEmail={sp.email ?? ''}
          diagnosticCode={sp.diagnostic}
          error={sp.error}
          locale={locale}
          next={sp.next}
        />
      </div>
    </main>
  );
}
