import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import {
  listFacilitatedSessions,
  listScenarios,
} from '@tuturuuu/meet-core/parley/repository';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { JoinSession } from '@/features/studio/join-session';
import { RecentSessions } from '@/features/studio/recent-sessions';
import { ScenarioDiscovery } from '@/features/studio/scenario-discovery';

export default async function Studio() {
  await connection();
  const user = await requireParleyUser();
  const [scenarios, archive, t] = await Promise.all([
    listScenarios(),
    listFacilitatedSessions(user.id).catch(() => {
      console.warn('Parley recent session archive unavailable');
      return null;
    }),
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
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/sessions/new">{t('new_session')}</Link>
          </Button>
        </div>
      </header>
      <section
        className="grid items-center gap-5 rounded-xl border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_auto]"
        aria-label={t('join')}
      >
        <div className="space-y-1">
          <h2 className="font-semibold">{t('powered_by_meet')}</h2>
          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            {t('meet_flow_hint')}
          </p>
        </div>
        <JoinSession />
      </section>
      <RecentSessions sessions={archive?.sessions ?? null} />
      <ScenarioDiscovery scenarios={scenarios} />
      <p className="border-t pt-5 text-muted-foreground text-xs leading-relaxed">
        {t('research_note')}
      </p>
    </>
  );
}
