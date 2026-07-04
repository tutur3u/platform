import { Button } from '@tuturuuu/ui/button';
import type { OrganizationalStructureMessages } from '../messages';
import { createStructureTranslator } from '../messages';
import type { Collaboration, EmploymentHistory, Supervisor } from '../types';
import { EmploymentSelect } from './form-controls';

interface RelationEditorSharedProps {
  employments: EmploymentHistory[];
  getEmploymentLabel: (employmentId: string) => string;
  messages: OrganizationalStructureMessages;
}

interface SupervisorsEditorProps extends RelationEditorSharedProps {
  addSupervisor: () => void;
  removeSupervisor: (index: number) => void;
  supervisors: Supervisor[];
  updateSupervisor: (index: number, patch: Partial<Supervisor>) => void;
}

interface CollaborationsEditorProps extends RelationEditorSharedProps {
  addCollaboration: () => void;
  collaborations: Collaboration[];
  removeCollaboration: (index: number) => void;
  updateCollaboration: (index: number, patch: Partial<Collaboration>) => void;
}

export function SupervisorsEditor({
  addSupervisor,
  employments,
  getEmploymentLabel,
  messages,
  removeSupervisor,
  supervisors,
  updateSupervisor,
}: SupervisorsEditorProps) {
  const t = createStructureTranslator(messages);

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground text-sm">
        {t('supervisors_desc')}
      </div>
      {supervisors.map((supervisor, index) => {
        const key = `${supervisor.employee_id}_${supervisor.supervisor_id}_${index}`;
        return (
          <div
            key={key}
            className="grid grid-cols-2 items-end gap-3 rounded-lg border border-border bg-background p-3"
          >
            <EmploymentSelect
              id={`employee_${key}`}
              label={t('employee')}
              value={supervisor.employee_id}
              employments={employments}
              getEmploymentLabel={getEmploymentLabel}
              onValueChange={(employeeId) =>
                updateSupervisor(index, {
                  employee_id: employeeId,
                })
              }
            />
            <div>
              <label
                htmlFor={`supervisor_${key}`}
                className="mb-1 block text-muted-foreground text-sm"
              >
                {t('supervisor')}
              </label>
              <div className="flex items-center gap-2">
                <EmploymentSelect
                  className="min-w-0 flex-1"
                  id={`supervisor_${key}`}
                  value={supervisor.supervisor_id}
                  employments={employments}
                  getEmploymentLabel={getEmploymentLabel}
                  onValueChange={(supervisorId) =>
                    updateSupervisor(index, {
                      supervisor_id: supervisorId,
                    })
                  }
                />
                <Button
                  variant="outline"
                  onClick={() => removeSupervisor(index)}
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
  );
}

export function CollaborationsEditor({
  addCollaboration,
  collaborations,
  employments,
  getEmploymentLabel,
  messages,
  removeCollaboration,
  updateCollaboration,
}: CollaborationsEditorProps) {
  const t = createStructureTranslator(messages);

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground text-sm">
        {t('collaborations_desc')}
      </div>
      {collaborations.map((collaboration, index) => {
        const key = `${collaboration.internal_id}_${collaboration.external_id}_${index}`;
        return (
          <div
            key={key}
            className="grid grid-cols-2 items-end gap-3 rounded-lg border border-border bg-background p-3"
          >
            <EmploymentSelect
              id={`internal_${key}`}
              label={t('internal_person')}
              value={collaboration.internal_id}
              employments={employments}
              getEmploymentLabel={getEmploymentLabel}
              onValueChange={(internalId) =>
                updateCollaboration(index, {
                  internal_id: internalId,
                })
              }
            />
            <div>
              <label
                htmlFor={`external_${key}`}
                className="mb-1 block text-muted-foreground text-sm"
              >
                {t('external_person')}
              </label>
              <div className="flex items-center gap-2">
                <EmploymentSelect
                  className="min-w-0 flex-1"
                  id={`external_${key}`}
                  value={collaboration.external_id}
                  employments={employments}
                  getEmploymentLabel={getEmploymentLabel}
                  onValueChange={(externalId) =>
                    updateCollaboration(index, {
                      external_id: externalId,
                    })
                  }
                />
                <Button
                  variant="outline"
                  onClick={() => removeCollaboration(index)}
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
  );
}
