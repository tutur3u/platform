import { BrainCircuit } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotAuthorizedPage() {
  const t = await getTranslations('auth');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-root-background p-6">
      <section className="w-full max-w-md border border-border bg-card p-6 shadow-lg">
        <div className="mb-5 flex h-12 w-12 items-center justify-center border border-border bg-dynamic-blue/10">
          <BrainCircuit className="h-6 w-6 text-dynamic-blue" />
        </div>
        <h1 className="font-semibold text-2xl tracking-normal">
          {t('blockedTitle')}
        </h1>
        <p className="mt-3 text-muted-foreground text-sm leading-6">
          {t('blockedDescription')}
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/api/auth/logout">{t('switchAccount')}</Link>
        </Button>
      </section>
    </main>
  );
}
