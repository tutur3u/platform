import { requireParleyStudioAdministrator } from '@tuturuuu/meet-core/parley/authorization';
import { scenarioSchema } from '@tuturuuu/meet-core/parley/contracts';
import { parleyDatabase } from '@tuturuuu/meet-core/parley/database';
import { RoleEditor } from '@tuturuuu/meet-core/parley/role-editor';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { saveStudioScenario } from '@/features/studio/scenario-admin-actions';

export default async function ManageScenarios() {
  await connection();
  await requireParleyStudioAdministrator();
  const [t, result] = await Promise.all([
    getTranslations('parley-admin'),
    (await parleyDatabase())
      .schema('private')
      .from('parley_scenarios')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100),
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
      {[null, ...(result.data ?? [])].map((scenario) => (
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
          <form
            action={saveStudioScenario}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            {scenario && <input type="hidden" name="id" value={scenario.id} />}
            <label className="text-sm">
              {t('name')}
              <Input
                name="title"
                defaultValue={scenario?.title}
                required
                maxLength={200}
              />
            </label>
            <label className="text-sm">
              {t('category')}
              <Input
                name="category"
                defaultValue={scenario?.category}
                required
                maxLength={80}
              />
            </label>
            <label className="text-sm md:col-span-2">
              {t('briefing')}
              <Textarea
                name="briefing"
                defaultValue={scenario?.briefing}
                maxLength={12000}
              />
            </label>
            <label className="text-sm md:col-span-2">
              {t('instructions')}
              <Textarea
                name="instructions"
                defaultValue={scenario?.instructions}
                required
                maxLength={24000}
                rows={8}
              />
            </label>
            <RoleEditor
              initialRoles={scenarioSchema.shape.roles.parse(
                scenario?.roles ?? []
              )}
            />
            <label className="text-sm md:col-span-2">
              {t('rubric')}
              <Textarea
                name="rubric"
                defaultValue={scenario?.rubric}
                maxLength={12000}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={scenario?.enabled}
              />
              {t('publish')}
            </label>
            <Button type="submit">{t('save')}</Button>
          </form>
        </details>
      ))}
    </main>
  );
}
