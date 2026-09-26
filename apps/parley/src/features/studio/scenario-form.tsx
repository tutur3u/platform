'use client';

import type { ScenarioInput } from '@tuturuuu/meet-core/parley/contracts';
import { RoleEditor } from '@tuturuuu/meet-core/parley/role-editor';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveStudioScenario } from './scenario-admin-actions';
import type { ScenarioSaveState } from './scenario-save-state';

const initialState: ScenarioSaveState = { status: 'idle', errors: {} };

export function ScenarioForm({
  scenario,
}: {
  scenario: (ScenarioInput & { id: string }) | null;
}) {
  const t = useTranslations('parley-admin');
  const [state, action, pending] = useActionState(
    saveStudioScenario,
    initialState
  );
  const error = (field: keyof ScenarioInput) =>
    state.errors[field] ? (
      <span className="block text-destructive text-xs" role="alert">
        {t('invalid_field')}
      </span>
    ) : null;
  return (
    <form action={action} className="mt-5 grid gap-4 md:grid-cols-2">
      {scenario && <input type="hidden" name="id" value={scenario.id} />}
      <label className="text-sm">
        {t('name')}
        <Input
          name="title"
          defaultValue={scenario?.title}
          required
          maxLength={200}
          aria-invalid={Boolean(state.errors.title)}
        />
        {error('title')}
      </label>
      <label className="text-sm">
        {t('category')}
        <Input
          name="category"
          defaultValue={scenario?.category}
          required
          maxLength={80}
          aria-invalid={Boolean(state.errors.category)}
        />
        {error('category')}
      </label>
      <label className="text-sm md:col-span-2">
        {t('briefing')}
        <Textarea
          name="briefing"
          defaultValue={scenario?.briefing}
          maxLength={12000}
          aria-invalid={Boolean(state.errors.briefing)}
        />
        {error('briefing')}
      </label>
      <label className="text-sm md:col-span-2">
        {t('instructions')}
        <Textarea
          name="instructions"
          defaultValue={scenario?.instructions}
          required
          maxLength={24000}
          rows={8}
          aria-invalid={Boolean(state.errors.instructions)}
        />
        {error('instructions')}
      </label>
      <RoleEditor initialRoles={scenario?.roles ?? []} />
      {state.errors.roles && (
        <p className="text-destructive text-xs md:col-span-2" role="alert">
          {t('invalid_field')}
        </p>
      )}
      <label className="text-sm md:col-span-2">
        {t('rubric')}
        <Textarea
          name="rubric"
          defaultValue={scenario?.rubric}
          maxLength={12000}
          aria-invalid={Boolean(state.errors.rubric)}
        />
        {error('rubric')}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={scenario?.enabled}
        />
        {t('publish')}
      </label>
      <Button type="submit" disabled={pending}>
        {t('save')}
      </Button>
      {state.status === 'failed' && (
        <p className="text-destructive text-sm md:col-span-2" role="alert">
          {t('save_failed')}
        </p>
      )}
      {state.status === 'saved' && (
        <p className="text-sm md:col-span-2" role="status">
          {t('saved')}
        </p>
      )}
    </form>
  );
}
