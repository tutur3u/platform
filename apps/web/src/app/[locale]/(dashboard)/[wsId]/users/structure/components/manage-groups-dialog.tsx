'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { Organization, OrganizationalData } from '../types';

interface ManageGroupsDialogProps {
  open: boolean;
  onClose: () => void;
  data: OrganizationalData;
  onSave: (orgs: Organization[]) => void;
}

export function ManageGroupsDialog({
  open,
  onClose,
  data,
  onSave,
}: ManageGroupsDialogProps) {
  const t = useTranslations('organizational_structure');
  const [orgs, setOrgs] = useState<Organization[]>(() => data.organizations);

  const addGroup = () => {
    setOrgs((prev) => [
      ...prev,
      {
        id: `org_${Date.now()}`,
        name: '',
        description: '',
        color: undefined,
        bgColor: undefined,
      },
    ]);
  };

  const updateGroup = (id: string, patch: Partial<Organization>) => {
    setOrgs((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const removeGroup = (id: string) => {
    setOrgs((prev) => prev.filter((o) => o.id !== id));
  };

  const isValid = useMemo(() => orgs.every((o) => o.name.trim()), [orgs]);

  const save = () => {
    if (!isValid) return;
    onSave(orgs);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-lg">
            {t('manage_groups')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-auto pr-2">
          {orgs.map((o) => (
            <div
              key={o.id}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`group_name_${o.id}`}
                    className="mb-1 block text-muted-foreground text-sm"
                  >
                    {t('group_name')}
                  </label>
                  <input
                    id={`group_name_${o.id}`}
                    value={o.name}
                    onChange={(e) =>
                      updateGroup(o.id, { name: e.target.value })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`group_color_${o.id}`}
                    className="mb-1 block text-muted-foreground text-sm"
                  >
                    {t('color')}
                  </label>
                  <input
                    id={`group_color_${o.id}`}
                    value={o.color || ''}
                    onChange={(e) =>
                      updateGroup(o.id, { color: e.target.value })
                    }
                    placeholder="#3b82f6"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="col-span-2">
                  <label
                    htmlFor={`group_description_${o.id}`}
                    className="mb-1 block text-muted-foreground text-sm"
                  >
                    {t('description')}
                  </label>
                  <input
                    id={`group_description_${o.id}`}
                    value={o.description}
                    onChange={(e) =>
                      updateGroup(o.id, { description: e.target.value })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-muted-foreground text-xs">{o.id}</div>
                <Button variant="outline" onClick={() => removeGroup(o.id)}>
                  {t('remove')}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" onClick={addGroup}>
            {t('add_group')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button onClick={save} disabled={!isValid}>
              {t('save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
