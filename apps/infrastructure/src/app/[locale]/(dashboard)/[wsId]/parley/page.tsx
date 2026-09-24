import {
  saveParleyMember,
  saveParleyScenario,
  uploadParleyReference,
} from '@tuturuuu/meet-core/parley/admin-actions';
import { requireParleyAdministrator } from '@tuturuuu/meet-core/parley/authorization';
import { scenarioSchema } from '@tuturuuu/meet-core/parley/contracts';
import { parleyDatabase } from '@tuturuuu/meet-core/parley/database';
import { RoleEditor } from '@tuturuuu/meet-core/parley/role-editor';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';

export default async function ParleyAdministration({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  await enforceInfrastructureRootWorkspace((await params).wsId);
  await requireParleyAdministrator();
  const t = await getTranslations('parley-admin');
  const db = (await parleyDatabase()).schema('private');
  const [members, scenarios, references] = await Promise.all([
    db
      .from('parley_members')
      .select('email, enabled')
      .order('email')
      .limit(200),
    db
      .from('parley_scenarios')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100),
    db
      .from('parley_references')
      .select('id, filename, scenario_id, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (members.error || scenarios.error || references.error)
    throw new Error('Parley database unavailable');
  return (
    <main className="space-y-8">
      <header>
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>
      </header>
      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="font-semibold text-lg">{t('access')}</h2>
        <p className="text-muted-foreground text-sm">{t('access_hint')}</p>
        <form
          action={saveParleyMember}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex-1 text-sm">
            {t('email')}
            <Input type="email" name="email" required maxLength={254} />
          </label>
          <input type="hidden" name="enabled" value="true" />
          <Button type="submit">{t('allow')}</Button>
        </form>
        <ul className="divide-y">
          {members.data?.map((member) => (
            <li
              className="flex items-center justify-between gap-4 py-3 text-sm"
              key={member.email}
            >
              <span>{member.email}</span>
              <form action={saveParleyMember}>
                <input type="hidden" name="email" value={member.email} />
                <input
                  type="hidden"
                  name="enabled"
                  value={String(!member.enabled)}
                />
                <Button size="sm" variant="outline">
                  {member.enabled ? t('revoke') : t('allow')}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="font-semibold text-lg">{t('references')}</h2>
        <p className="text-muted-foreground text-sm">{t('reference_hint')}</p>
        <form
          action={uploadParleyReference}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex-1 text-sm">
            {t('file')}
            <Input type="file" name="file" accept=".docx,.pdf,.txt" required />
          </label>
          <label className="text-sm">
            {t('scenario')}
            <select
              name="scenario_id"
              className="block rounded border bg-background p-2"
            >
              <option value="">{t('unassigned')}</option>
              {scenarios.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <Button>{t('upload')}</Button>
        </form>
        <ul className="list-inside list-disc text-sm">
          {references.data?.map((r) => (
            <li key={r.id}>
              <a className="underline" href={`/api/parley/references/${r.id}`}>
                {r.filename}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">{t('scenarios')}</h2>
        {[null, ...(scenarios.data ?? [])].map((scenario) => (
          <details
            key={scenario?.id ?? 'new'}
            className="rounded-xl border p-5"
          >
            <summary className="cursor-pointer font-medium">
              {scenario?.title ?? t('create')}
            </summary>
            <form
              action={saveParleyScenario}
              className="mt-5 grid gap-4 md:grid-cols-2"
            >
              {scenario && (
                <input type="hidden" name="id" value={scenario.id} />
              )}
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
      </section>
    </main>
  );
}
