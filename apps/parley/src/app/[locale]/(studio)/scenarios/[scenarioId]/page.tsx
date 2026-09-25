import { ArrowLeft, Users } from '@tuturuuu/icons';
import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import { getPublishedScenario } from '@tuturuuu/meet-core/parley/repository';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { StartSession } from '@/features/studio/start-session';

export default async function Scenario({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  await connection();
  await requireParleyUser();
  const { scenarioId } = await params;
  if (!z.uuid().safeParse(scenarioId).success) notFound();
  const scenario = await getPublishedScenario(scenarioId);
  if (!scenario) notFound();
  const t = await getTranslations('parley');
  return (
    <>
      <Button asChild variant="ghost">
        <Link href="/">
          <ArrowLeft className="size-4" />
          {t('discover')}
        </Link>
      </Button>
      <header className="max-w-3xl space-y-3">
        <p className="font-medium text-muted-foreground text-sm">
          {scenario.category} · {t('revision', { revision: scenario.revision })}
        </p>
        <h1 className="font-semibold text-3xl tracking-tight">
          {scenario.title}
        </h1>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-semibold text-lg">{t('briefing')}</h2>
            <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
              {scenario.briefing}
            </p>
          </section>
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-semibold text-lg">
              <Users className="size-5" />
              {t('roles')}
            </h2>
            {scenario.roles.length ? (
              <div className="divide-y rounded-xl border">
                {scenario.roles.map((role, index) => (
                  <div
                    key={`${index}-${role.name}`}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <h3 className="font-medium">{role.name}</h3>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                      {t(`controller_${role.controller}`)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('roles_empty')}
              </p>
            )}
          </section>
          <p className="rounded-xl border bg-muted/20 p-4 text-muted-foreground text-sm">
            {t('research_note')}
          </p>
        </div>
        <aside className="space-y-4 rounded-xl border bg-card p-5 lg:sticky lg:top-6">
          <h2 className="font-semibold">{t('prepare')}</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t('prepare_hint')}
          </p>
          <StartSession scenarioId={scenario.id} />
          <p className="border-t pt-4 text-muted-foreground text-xs">
            {t('ai_hint')}
          </p>
        </aside>
      </div>
    </>
  );
}
