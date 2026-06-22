'use client';

import { Button } from '@tuturuuu/ui/button';
import { useMemo, useState } from 'react';
import {
  createStructureTranslator,
  type OrganizationalStructureMessages,
} from '../messages';
import type {
  Collaboration,
  EmploymentHistory,
  OrganizationalData,
  Supervisor,
} from '../types';
import { CollaborationsEditor, SupervisorsEditor } from './relation-editors';

interface ManageRelationsDialogProps {
  open: boolean;
  onClose: () => void;
  data: OrganizationalData;
  messages: OrganizationalStructureMessages;
  onSave: (params: {
    supervisors: Supervisor[];
    collaborations: Collaboration[];
  }) => void;
}

export function ManageRelationsDialog({
  open,
  onClose,
  data,
  messages,
  onSave,
}: ManageRelationsDialogProps) {
  const t = createStructureTranslator(messages);

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
          <SupervisorsEditor
            addSupervisor={addSupervisor}
            employments={employments}
            getEmploymentLabel={getEmploymentLabel}
            messages={messages}
            removeSupervisor={removeSupervisor}
            supervisors={supervisors}
            updateSupervisor={updateSupervisor}
          />
        ) : (
          <CollaborationsEditor
            addCollaboration={addCollaboration}
            collaborations={collaborations}
            employments={employments}
            getEmploymentLabel={getEmploymentLabel}
            messages={messages}
            removeCollaboration={removeCollaboration}
            updateCollaboration={updateCollaboration}
          />
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
