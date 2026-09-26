import { requireParleyStudioAdministrator } from '@tuturuuu/meet-core/parley/authorization';
import { scenarioSchema } from '@tuturuuu/meet-core/parley/contracts';
import { parleyDatabase } from '@tuturuuu/meet-core/parley/database';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { ScenarioForm } from '@/features/studio/scenario-form';

export default async function ManageScenarios({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await connection();
  await requireParleyStudioAdministrator();
  const page = Math.min(
    10000,
    Math.max(0, Number.parseInt((await searchParams).page ?? '0', 10) || 0)
  );
  const [t, result] = await Promise.all([
    getTranslations('parley-admin'),
    (await parleyDatabase())
      .schema('private')
      .from('parley_scenarios')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('id')
      .range(page * 20, page * 20 + 20),
  ]);
  if (result.error) throw new Error('Scenario administration unavailable');
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-semibold text-3xl tracking-tight">
          {t('scenarios')}
        </h1>
        <p className="text-muted-foreground">{t('studio_description')}</p>
      </header>
      {[null, ...(result.data ?? []).slice(0, 20)].map((scenario) => (
        <details
          key={scenario?.id ?? 'new'}
          className="rounded-xl border bg-card p-5"
        >
          <summary className="cursor-pointer font-medium">
            {scenario?.title ?? t('create')}
            {scenario && (
              <span className="ml-2 text-muted-foreground text-xs">
                {scenario.enabled ? t('published') : t('draft')}
              </span>
            )}
          </summary>
          <ScenarioForm
            scenario={
              scenario
                ? { id: scenario.id, ...scenarioSchema.parse(scenario) }
                : null
            }
          />
        </details>
      ))}
      <nav aria-label={t('pages')} className="flex justify-between gap-3">
        {page > 0 ? (
          <Button asChild variant="outline">
            <Link href={`/manage/scenarios?page=${page - 1}`}>
              {t('previous')}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {(result.data?.length ?? 0) > 20 && (
          <Button asChild variant="outline">
            <Link href={`/manage/scenarios?page=${page + 1}`}>{t('next')}</Link>
          </Button>
        )}
      </nav>
    </main>
  );
}
