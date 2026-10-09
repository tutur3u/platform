import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import { listScenarios } from '@tuturuuu/meet-core/parley/repository';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { SessionSetup } from '@/features/studio/session-setup';

export default async function NewSession() {
  await connection();
  await requireParleyUser();
  const [scenarios, t] = await Promise.all([
    listScenarios(),
    getTranslations('parley'),
  ]);
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-semibold text-3xl tracking-tight">
          {t('new_session')}
        </h1>
        <p className="text-muted-foreground">{t('new_session_hint')}</p>
        <p className="text-muted-foreground text-sm">{t('prepare_hint')}</p>
      </header>
      {scenarios.length ? (
        <SessionSetup scenarios={scenarios} />
      ) : (
        <div className="space-y-4 rounded-xl border border-dashed p-8">
          <p className="text-muted-foreground">{t('empty_hint')}</p>
          <Button asChild variant="outline">
            <Link href="/">{t('discover')}</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
