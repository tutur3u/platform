'use client';
import { Plus, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import type { ScenarioInput } from './contracts';

export function RoleEditor({
  initialRoles,
}: {
  initialRoles: ScenarioInput['roles'];
}) {
  const t = useTranslations('parley-admin');
  const id = useId();
  const nextKey = useRef(initialRoles.length);
  const [roles, setRoles] = useState(
    initialRoles.map((role, key) => ({ ...role, key }))
  );
  const update = (
    key: number,
    patch: Partial<ScenarioInput['roles'][number]>
  ) =>
    setRoles((previous) =>
      previous.map((role) => (role.key === key ? { ...role, ...patch } : role))
    );
  return (
    <fieldset className="space-y-3 md:col-span-2">
      <legend className="mb-2 text-sm">{t('roles')}</legend>
      <input
        type="hidden"
        name="roles"
        value={JSON.stringify(roles.map(({ key: _key, ...role }) => role))}
      />
      {roles.map((role) => (
        <div key={role.key} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-end gap-3">
            <label className="flex-1 text-sm" htmlFor={`${id}-${role.key}`}>
              {t('role_name')}
              <Input
                id={`${id}-${role.key}`}
                value={role.name}
                maxLength={100}
                required
                onChange={(e) => update(role.key, { name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              {t('controller')}
              <select
                className="block h-9 rounded border bg-background px-2"
                value={role.controller}
                onChange={(e) =>
                  update(role.key, {
                    controller: e.target.value as 'human' | 'ai' | 'observer',
                  })
                }
              >
                <option value="human">{t('human')}</option>
                <option value="ai">{t('ai')}</option>
                <option value="observer">{t('observer')}</option>
              </select>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('remove_role')}
              onClick={() =>
                setRoles((previous) =>
                  previous.filter((item) => item.key !== role.key)
                )
              }
            >
              <X className="size-4" />
            </Button>
          </div>
          <label className="block text-sm">
            {t('role_brief')}
            <Textarea
              value={role.brief}
              maxLength={2000}
              onChange={(e) => update(role.key, { brief: e.target.value })}
            />
          </label>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={roles.length >= 16}
        onClick={() =>
          setRoles((previous) => [
            ...previous,
            {
              key: nextKey.current++,
              name: '',
              brief: '',
              controller: 'human',
            },
          ])
        }
      >
        <Plus className="size-4" />
        {t('add_role')}
      </Button>
    </fieldset>
  );
}
