import {
  type FleetOwnerProject,
  type FleetProjectInput,
  fleetProjectInputSchema,
} from '@tuturuuu/internal-api/fleet';
import { Button } from '@tuturuuu/ui/button';
import { SettingsSectionMessage } from '@tuturuuu/ui/custom/settings-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { type FormEvent, useState } from 'react';
import { TextField } from './fields';
import { ChangeNotice, changeState, OwnerSection } from './owner-parts';
import { useUpsertFleetProject } from './owner-queries';
import { Panel } from './query-message';
import { useFleetText } from './text';

type ProjectField = keyof FleetProjectInput;
const blank: FleetProjectInput = { key: '', nameEn: '', nameVi: '' };

/** Adds catalog projects and renames them. Keys never change. */
export function CatalogSection({
  projects,
}: {
  projects: FleetOwnerProject[];
}) {
  const { t } = useFleetText();
  const mutation = useUpsertFleetProject();
  const [draft, setDraft] = useState(blank);
  const [renaming, setRenaming] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ProjectField, true>>>({});
  const change = changeState(mutation, () => t.access.projectSaved);

  const edit = (patch: Partial<FleetProjectInput>) => {
    if (change.kind !== 'saving') mutation.reset();
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = fleetProjectInputSchema.safeParse({
      key: draft.key.trim(),
      nameEn: draft.nameEn.trim(),
      nameVi: draft.nameVi.trim(),
    });
    if (!parsed.success) {
      const found = Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0]), true])
      ) as Partial<Record<ProjectField, true>>;
      setErrors(found);
      const first = (['key', 'nameEn', 'nameVi'] as const).find(
        (field) => found[field]
      );
      if (first) document.getElementById(`fleet-project-${first}`)?.focus();
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data, {
      onSuccess: (result) => {
        if (result.kind === 'ok') {
          setDraft(blank);
          setRenaming(false);
        }
      },
    });
  };

  const error = (field: ProjectField) =>
    errors[field]
      ? draft[field].trim()
        ? t.access.invalid
        : t.access.required
      : undefined;

  return (
    <OwnerSection id="fleet-catalog" title={t.access.catalog}>
      {projects.length === 0 ? (
        <SettingsSectionMessage>{t.access.noCatalog}</SettingsSectionMessage>
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.access.key}</TableHead>
                <TableHead>{t.access.nameEn}</TableHead>
                <TableHead>{t.access.nameVi}</TableHead>
                <TableHead>
                  <span className="sr-only">{t.access.edit}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.key}>
                  <TableCell className="font-mono text-xs">
                    {project.key}
                  </TableCell>
                  <TableCell>{project.nameEn}</TableCell>
                  <TableCell>{project.nameVi}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        mutation.reset();
                        setErrors({});
                        setRenaming(true);
                        setDraft({
                          key: project.key,
                          nameEn: project.nameEn,
                          nameVi: project.nameVi,
                        });
                      }}
                    >
                      {t.access.edit}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      <Panel>
        <form onSubmit={submit} noValidate>
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-3 md:px-5">
            {renaming ? (
              <div className="space-y-2">
                <p className="font-medium text-sm">{t.access.key}</p>
                <p className="font-mono text-sm">{draft.key}</p>
              </div>
            ) : (
              <TextField
                id="fleet-project-key"
                label={t.access.key}
                mono
                error={error('key')}
                value={draft.key}
                onChange={(key) => edit({ key })}
              />
            )}
            <TextField
              id="fleet-project-nameEn"
              label={t.access.nameEn}
              error={error('nameEn')}
              value={draft.nameEn}
              onChange={(nameEn) => edit({ nameEn })}
            />
            <TextField
              id="fleet-project-nameVi"
              label={t.access.nameVi}
              error={error('nameVi')}
              value={draft.nameVi}
              onChange={(nameVi) => edit({ nameVi })}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 md:px-5">
            <div className="mr-auto">
              <ChangeNotice state={change} />
            </div>
            {renaming && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setRenaming(false);
                  setDraft(blank);
                  setErrors({});
                }}
              >
                {t.access.cancel}
              </Button>
            )}
            <Button type="submit" disabled={change.kind === 'saving'}>
              {change.kind === 'saving'
                ? t.access.saving
                : renaming
                  ? t.access.saveProject
                  : t.access.addProject}
            </Button>
          </div>
        </form>
      </Panel>
    </OwnerSection>
  );
}
