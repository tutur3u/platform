import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import { listScenarios } from '@tuturuuu/meet-core/parley/repository';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { JoinSession } from '@/features/studio/join-session';
import { ScenarioDiscovery } from '@/features/studio/scenario-discovery';

export default async function Studio() {
  await connection();
  await requireParleyUser();
  const [scenarios, t] = await Promise.all([
    listScenarios(),
    getTranslations('parley'),
  ]);
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl space-y-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
            {t('eyebrow')}
          </p>
          <h1 className="font-semibold text-3xl tracking-tight">
            {t('discover')}
          </h1>
          <p className="text-muted-foreground">{t('discover_hint')}</p>
        </div>
        <JoinSession />
      </header>
      <ScenarioDiscovery scenarios={scenarios} />
      <p className="border-t pt-5 text-muted-foreground text-xs leading-relaxed">
        {t('research_note')}
      </p>
    </>
  );
}
