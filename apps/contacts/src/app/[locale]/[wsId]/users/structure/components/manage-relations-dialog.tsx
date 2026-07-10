'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type {
  Collaboration,
  EmploymentHistory,
  OrganizationalData,
  Supervisor,
} from '../types';

interface ManageRelationsDialogProps {
  open: boolean;
  onClose: () => void;
  data: OrganizationalData;
  onSave: (params: {
    supervisors: Supervisor[];
    collaborations: Collaboration[];
  }) => void;
}

export function ManageRelationsDialog({
  open,
  onClose,
  data,
  onSave,
}: ManageRelationsDialogProps) {
  const t = useTranslations('organizational_structure');

  const [tab, setTab] = useState<'supervisors' | 'collaborations'>(
    'supervisors'
  );
  const [supervisors, setSupervisors] = useState<Supervisor[]>(
    () => data.supervisors
  );
  const [collaborations, setCollaborations] = useState<Collaboration[]>(
    () => data.collaborations
  );

  const employments = useMemo<EmploymentHistory[]>(
    () => data.employment_history,
    [data.employment_history]
  );

  const getEmploymentLabel = (employmentId: string) => {
    const emp = data.employment_history.find((e) => e.id === employmentId);
    if (!emp) return employmentId;
    const person = data.people.find((p) => p.id === emp.person_id);
    const role = data.roles.find((r) => r.id === emp.role_id);
    const org = data.organizations.find((o) => o.id === emp.organization_id);
    return `${person?.fullName ?? employmentId} • ${role?.name ?? ''} • ${org?.name ?? ''}`.trim();
  };

  const addSupervisor = () => {
    const first = employments[0]?.id ?? '';
    setSupervisors((prev) => [
      ...prev,
      { employee_id: first, supervisor_id: first },
    ]);
  };
  const removeSupervisor = (index: number) => {
    setSupervisors((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSupervisor = (index: number, patch: Partial<Supervisor>) => {
    setSupervisors((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  };

  const addCollaboration = () => {
    const first = employments[0]?.id ?? '';
    setCollaborations((prev) => [
      ...prev,
      { internal_id: first, external_id: first },
    ]);
  };
  const removeCollaboration = (index: number) => {
    setCollaborations((prev) => prev.filter((_, i) => i !== index));
  };
  const updateCollaboration = (
    index: number,
    patch: Partial<Collaboration>
  ) => {
    setCollaborations((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
    );
  };

  const save = () => {
    onSave({ supervisors, collaborations });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-lg">
            {t('manage_relations')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('supervisors')}
            className={`rounded-md border px-3 py-1 text-sm ${tab === 'supervisors' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
          >
            {t('supervisors')}
          </button>
          <button
            type="button"
            onClick={() => setTab('collaborations')}
            className={`rounded-md border px-3 py-1 text-sm ${tab === 'collaborations' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
          >
            {t('collaborations')}
          </button>
        </div>

        {tab === 'supervisors' ? (
          <div className="space-y-3">
            <div className="text-muted-foreground text-sm">
              {t('supervisors_desc')}
            </div>
            {supervisors.map((s) => {
              const key = `${s.employee_id}_${s.supervisor_id}`;
              return (
                <div
                  key={key || `sup_${Math.random().toString(36).slice(2)}`}
                  className="grid grid-cols-2 items-end gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div>
                    <label
                      htmlFor={`employee_${key}`}
                      className="mb-1 block text-muted-foreground text-sm"
                    >
                      {t('employee')}
                    </label>
                    <select
                      id={`employee_${key}`}
                      value={s.employee_id}
                      onChange={(e) =>
                        updateSupervisor(supervisors.indexOf(s), {
                          employee_id: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {employments.map((e) => (
                        <option key={e.id} value={e.id}>
                          {getEmploymentLabel(e.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`supervisor_${key}`}
                      className="mb-1 block text-muted-foreground text-sm"
                    >
                      {t('supervisor')}
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        id={`supervisor_${key}`}
                        value={s.supervisor_id}
                        onChange={(e) =>
                          updateSupervisor(supervisors.indexOf(s), {
                            supervisor_id: e.target.value,
                          })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        {employments.map((e) => (
                          <option key={e.id} value={e.id}>
                            {getEmploymentLabel(e.id)}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        onClick={() => removeSupervisor(supervisors.indexOf(s))}
                      >
                        {t('remove')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div>
              <Button variant="outline" onClick={addSupervisor}>
                {t('add_relation')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-muted-foreground text-sm">
              {t('collaborations_desc')}
            </div>
            {collaborations.map((c) => {
              const key = `${c.internal_id}_${c.external_id}`;
              return (
                <div
                  key={key || `col_${Math.random().toString(36).slice(2)}`}
                  className="grid grid-cols-2 items-end gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div>
                    <label
                      htmlFor={`internal_${key}`}
                      className="mb-1 block text-muted-foreground text-sm"
                    >
                      {t('internal_person')}
                    </label>
                    <select
                      id={`internal_${key}`}
                      value={c.internal_id}
                      onChange={(e) =>
                        updateCollaboration(collaborations.indexOf(c), {
                          internal_id: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {employments.map((e) => (
                        <option key={e.id} value={e.id}>
                          {getEmploymentLabel(e.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`external_${key}`}
                      className="mb-1 block text-muted-foreground text-sm"
                    >
                      {t('external_person')}
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        id={`external_${key}`}
                        value={c.external_id}
                        onChange={(e) =>
                          updateCollaboration(collaborations.indexOf(c), {
                            external_id: e.target.value,
                          })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        {employments.map((e) => (
                          <option key={e.id} value={e.id}>
                            {getEmploymentLabel(e.id)}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        onClick={() =>
                          removeCollaboration(collaborations.indexOf(c))
                        }
                      >
                        {t('remove')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div>
              <Button variant="outline" onClick={addCollaboration}>
                {t('add_collaboration')}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save}>{t('save')}</Button>
        </div>
      </div>
    </div>
  );
}
