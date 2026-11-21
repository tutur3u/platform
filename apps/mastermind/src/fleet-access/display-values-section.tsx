import {
  type FleetDisplayField,
  type FleetOwnerProject,
  fleetDisplayFields,
  fleetDisplayValueInputSchema,
} from '@tuturuuu/internal-api/fleet';
import { Button } from '@tuturuuu/ui/button';
import { SettingsSectionMessage } from '@tuturuuu/ui/custom/settings-section';
import { type FormEvent, useState } from 'react';
import { ChoiceField, TextField } from './fields';
import {
  ChangeNotice,
  ConfirmDialog,
  changeState,
  OwnerSection,
} from './owner-parts';
import { useSetFleetDisplayValue } from './owner-queries';
import { Panel } from './query-message';
import { fill, useFleetText } from './text';

/** Approved display values per project and field for the digest. */
export function DisplayValuesSection({
  projects,
}: {
  projects: FleetOwnerProject[];
}) {
  const { t } = useFleetText();
  const mutation = useSetFleetDisplayValue();
  const [projectKey, setProjectKey] = useState(projects[0]?.key ?? '');
  const [field, setField] = useState<FleetDisplayField>('lane');
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const change = changeState(mutation, () => '');
  const project =
    projects.find((entry) => entry.key === projectKey) ?? projects[0];
  if (!project) return null;
  const values = project.displayValues[field];

  const choose = (patch: () => void) => {
    mutation.reset();
    setInvalid(false);
    patch();
  };

  const approve = (event: FormEvent) => {
    event.preventDefault();
    const parsed = fleetDisplayValueInputSchema.safeParse({
      projectKey: project.key,
      field,
      value: value.trim(),
      approved: true,
    });
    setInvalid(!parsed.success);
    if (!parsed.success) {
      document.getElementById('fleet-display-value')?.focus();
      return;
    }
    mutation.mutate(parsed.data, {
      onSuccess: (result) => {
        if (result.kind === 'ok') setValue('');
      },
    });
  };

  return (
    <OwnerSection id="fleet-display-values" title={t.access.displayValues}>
      <Panel>
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 md:px-5">
          <ChoiceField
            id="fleet-display-project"
            label={t.access.project}
            value={project.key}
            options={projects.map((entry) => ({
              value: entry.key,
              label: entry.key,
            }))}
            onChange={(next) => choose(() => setProjectKey(next))}
          />
          <ChoiceField
            id="fleet-display-field"
            label={t.access.field}
            value={field}
            options={fleetDisplayFields.map((entry) => ({
              value: entry,
              label: t.displayField[entry],
            }))}
            onChange={(next) => choose(() => setField(next))}
          />
        </div>
        {values.length === 0 ? (
          <div className="px-4 py-4 md:px-5">
            <SettingsSectionMessage>{t.access.noValues}</SettingsSectionMessage>
          </div>
        ) : (
          <ul className="divide-y">
            {values.map((entry) => (
              <li
                key={entry}
                className="flex items-center justify-between gap-3 px-4 py-2 md:px-5"
              >
                <span className="min-w-0 break-words text-sm">{entry}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={change.kind === 'saving'}
                  onClick={() => setRemoving(entry)}
                >
                  {t.access.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={approve}
          noValidate
          className="flex flex-wrap items-end gap-3 px-4 py-4 md:px-5"
        >
          <div className="min-w-0 flex-1">
            <TextField
              id="fleet-display-value"
              label={t.access.value}
              error={invalid ? t.ownerRefusal.invalid_value : undefined}
              value={value}
              onChange={(next) => {
                if (change.kind !== 'saving') mutation.reset();
                setValue(next);
              }}
            />
          </div>
          <Button type="submit" disabled={change.kind === 'saving'}>
            {change.kind === 'saving' ? t.access.saving : t.access.approve}
          </Button>
          {change.kind === 'refused' && (
            <div className="basis-full">
              <ChangeNotice state={change} />
            </div>
          )}
        </form>
      </Panel>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={fill(t.access.removeTitle, { value: removing ?? '' })}
        action={t.access.remove}
        destructive
        onConfirm={() => {
          if (removing === null) return;
          mutation.mutate({
            projectKey: project.key,
            field,
            value: removing,
            approved: false,
          });
        }}
      >
        <p>{t.access.removeBody}</p>
      </ConfirmDialog>
    </OwnerSection>
  );
}
