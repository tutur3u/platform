import {
  type FleetGrantInput,
  type FleetOwnerProject,
  fleetGrantTiers,
  fleetTierCeiling,
} from '@tuturuuu/internal-api/fleet';
import { Button } from '@tuturuuu/ui/button';
import { type FormEvent, useState } from 'react';
import { ChoiceField, TextField } from './fields';
import {
  checkGrant,
  editGrantDraft,
  type GrantDraft,
  type GrantErrors,
  type GrantField,
  toggle,
} from './owner-model';
import {
  ChangeNotice,
  CheckboxGroup,
  ConfirmDialog,
  changeState,
} from './owner-parts';
import { useGrantFleetAccess } from './owner-queries';
import { Panel } from './query-message';
import { fill, formatInstant, useFleetText } from './text';

const fieldIds: [GrantField, string][] = [
  ['email', 'fleet-grant-email'],
  ['capabilities', 'fleet-grant-capabilities'],
  ['projectKeys', 'fleet-grant-projects'],
  ['expiresOn', 'fleet-grant-expiry'],
  ['questionsPerHour', 'fleet-grant-questions'],
  ['intentsPerDay', 'fleet-grant-intents'],
  ['modelBudgetPerMonth', 'fleet-grant-budget'],
];

/**
 * A new grant names its account by email; an edit keeps the person and
 * carries the generation it read. Review opens a confirmation of the exact
 * grant before anything is sent.
 */
export function GrantForm({
  initial,
  projects,
  onClose,
}: {
  initial: GrantDraft;
  projects: FleetOwnerProject[];
  /** Closes the form, with the outcome when a grant was saved. */
  onClose: (saved?: string) => void;
}) {
  const { locale, t } = useFleetText();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<GrantErrors>({});
  const [review, setReview] = useState<FleetGrantInput | null>(null);
  const mutation = useGrantFleetAccess();
  const editing = initial.expectedGeneration !== null;
  const change = changeState(mutation, () => '');

  const edit = (patch: Partial<GrantDraft>) => {
    if (change.kind !== 'idle' && change.kind !== 'saving') mutation.reset();
    setDraft((current) => editGrantDraft(current, patch));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkGrant(draft);
    if ('errors' in checked) {
      setErrors(checked.errors);
      const first = fieldIds.find(([field]) => checked.errors[field]);
      if (first) document.getElementById(first[1])?.focus();
      return;
    }
    setErrors({});
    setReview(checked.input);
  };

  const message = (field: GrantField) => {
    const code = errors[field];
    return code ? t.access[code] : undefined;
  };
  const projectName = (key: string) => {
    const project = projects.find((entry) => entry.key === key);
    return project ? (locale === 'vi' ? project.nameVi : project.nameEn) : key;
  };

  return (
    <Panel>
      <form onSubmit={submit} noValidate>
        <div className="space-y-1 px-4 pt-4 md:px-5">
          <h3 className="font-medium text-sm">
            {editing ? t.access.editGrant : t.access.newGrant}
          </h3>
          {editing && (
            <p className="break-all text-muted-foreground text-sm">
              {draft.email}
            </p>
          )}
        </div>
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 md:px-5">
          {!editing && (
            <TextField
              id="fleet-grant-email"
              label={t.access.email}
              type="email"
              error={message('email')}
              value={draft.email}
              onChange={(email) => edit({ email })}
            />
          )}
          <ChoiceField
            id="fleet-grant-tier"
            label={t.access.tier}
            value={draft.tier}
            options={fleetGrantTiers.map((tier) => ({
              value: tier,
              label: t.tier[tier],
            }))}
            onChange={(tier) => edit({ tier })}
          />
          <div className="sm:col-span-2">
            <CheckboxGroup
              id="fleet-grant-capabilities"
              legend={t.access.capabilities}
              error={message('capabilities')}
              values={draft.capabilities}
              options={fleetTierCeiling[draft.tier].map((value) => ({
                value,
                label: t.capability[value],
              }))}
              onChange={(value, on) =>
                edit({ capabilities: toggle(draft.capabilities, value, on) })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <CheckboxGroup
              id="fleet-grant-projects"
              legend={t.access.projects}
              error={message('projectKeys')}
              values={draft.projectKeys}
              options={projects.map((project) => ({
                value: project.key,
                label: projectName(project.key),
              }))}
              onChange={(key, on) =>
                edit({ projectKeys: toggle(draft.projectKeys, key, on) })
              }
            />
          </div>
          <TextField
            id="fleet-grant-expiry"
            label={t.access.expiresOn}
            type="date"
            error={message('expiresOn')}
            value={draft.expiresOn}
            onChange={(expiresOn) => edit({ expiresOn })}
          />
          <TextField
            id="fleet-grant-questions"
            label={t.access.questionsPerHour}
            inputMode="numeric"
            error={message('questionsPerHour')}
            value={draft.questionsPerHour}
            onChange={(questionsPerHour) => edit({ questionsPerHour })}
          />
          <TextField
            id="fleet-grant-intents"
            label={t.access.intentsPerDay}
            inputMode="numeric"
            error={message('intentsPerDay')}
            value={draft.intentsPerDay}
            onChange={(intentsPerDay) => edit({ intentsPerDay })}
          />
          <TextField
            id="fleet-grant-budget"
            label={t.access.modelBudgetPerMonth}
            inputMode="numeric"
            error={message('modelBudgetPerMonth')}
            value={draft.modelBudgetPerMonth}
            onChange={(modelBudgetPerMonth) => edit({ modelBudgetPerMonth })}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 md:px-5">
          <div className="mr-auto">
            {Object.keys(errors).length > 0 ? (
              <p role="alert" className="text-destructive text-sm">
                {t.access.invalidForm}
              </p>
            ) : (
              <ChangeNotice state={change} />
            )}
          </div>
          <Button type="button" variant="ghost" onClick={() => onClose()}>
            {t.access.close}
          </Button>
          <Button type="submit" disabled={change.kind === 'saving'}>
            {change.kind === 'saving' ? t.access.saving : t.access.review}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={review !== null}
        onOpenChange={(open) => !open && setReview(null)}
        title={fill(
          editing ? t.access.confirmEditTitle : t.access.confirmGrantTitle,
          { email: draft.email.trim(), tier: t.tier[draft.tier] }
        )}
        action={t.access.confirm}
        onConfirm={() => {
          if (!review) return;
          mutation.mutate(review, {
            onSuccess: (result) => {
              if (result.kind === 'ok') {
                onClose(
                  result.data.result === 'granted'
                    ? t.access.granted
                    : t.access.updated
                );
              }
            },
          });
        }}
      >
        {review && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>{t.access.tier}</dt>
            <dd className="text-foreground">{t.tier[review.tier]}</dd>
            <dt>{t.access.capabilities}</dt>
            <dd className="text-foreground">
              {review.capabilities
                .map((value) => t.capability[value])
                .join(', ')}
            </dd>
            <dt>{t.access.projects}</dt>
            <dd className="text-foreground">
              {review.projectKeys.map(projectName).join(', ')}
            </dd>
            <dt>{t.access.expiry}</dt>
            <dd className="text-foreground">
              {review.expiresAt
                ? formatInstant(locale, review.expiresAt)
                : t.access.noExpiry}
            </dd>
          </dl>
        )}
      </ConfirmDialog>
    </Panel>
  );
}
