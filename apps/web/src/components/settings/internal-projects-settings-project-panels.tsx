'use client';

import { Clock, Search } from '@tuturuuu/icons';
import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
  WorkspaceExternalProjectBindingAudit,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  Field,
  formatTime,
  getWorkspaceLabel,
  HistoryList,
  StatusBadge,
} from './internal-projects-settings-components';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

export function InternalProjectSearchList({
  onOpenWorkspace,
  projectQuery,
  projects,
  selectedWorkspaceId,
  setProjectQuery,
}: {
  onOpenWorkspace: (workspace: ExternalProjectWorkspaceBindingSummary) => void;
  projectQuery: string;
  projects: ExternalProjectWorkspaceBindingSummary[];
  selectedWorkspaceId: string | null;
  setProjectQuery: (value: string) => void;
}) {
  const t = useTranslations();
  const tRoot = useTranslations('external-projects.root');

  return (
    <section className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={projectQuery}
          onChange={(event) => setProjectQuery(event.target.value)}
          placeholder={tRoot('project_search_placeholder')}
          className="pl-9"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {projects.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => onOpenWorkspace(workspace)}
            className={cn(
              'rounded-lg border border-border/70 bg-card/80 p-4 text-left transition-colors hover:border-foreground/25',
              selectedWorkspaceId === workspace.id && 'border-foreground/35'
            )}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge connected={workspace.binding.enabled} />
              {workspace.personal ? (
                <Badge variant="secondary" className="rounded-md">
                  {t('common.personal_account')}
                </Badge>
              ) : null}
            </div>
            <div className="font-medium">
              {getWorkspaceLabel(workspace, t('common.unnamed-workspace'))}
            </div>
            <div className="mt-1 truncate text-muted-foreground text-sm">
              {workspace.binding.canonical_project?.display_name ??
                workspace.binding.canonical_id ??
                tRoot('unbound_label')}
            </div>
            <div className="mt-3 flex items-center gap-2 text-muted-foreground text-xs">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(workspace.last_changed_at)}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SelectedSitePanel({
  activeTemplates,
  draftCanonicalId,
  isPending,
  mutationError,
  onSave,
  selectedAudits,
  selectedWorkspace,
  setDraftCanonicalId,
}: {
  activeTemplates: CanonicalExternalProject[];
  draftCanonicalId: string;
  isPending: boolean;
  mutationError: unknown;
  onSave: () => void;
  selectedAudits: WorkspaceExternalProjectBindingAudit[];
  selectedWorkspace: ExternalProjectWorkspaceBindingSummary | null;
  setDraftCanonicalId: (value: string) => void;
}) {
  const t = useTranslations();
  const tRoot = useTranslations('external-projects.root');
  const errorMessage = getErrorMessage(mutationError);

  return (
    <section className="rounded-lg border border-border/70 bg-card/80 p-4">
      <div className="mb-4 font-medium">{tRoot('selected_site_title')}</div>
      {selectedWorkspace ? (
        <div className="space-y-4">
          <div>
            <div className="font-medium">
              {getWorkspaceLabel(
                selectedWorkspace,
                t('common.unnamed-workspace')
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              {tRoot('internal_id_label')}: {selectedWorkspace.id}
            </div>
          </div>
          <Field label={tRoot('selected_template_label')}>
            <Select
              value={draftCanonicalId || '__none__'}
              onValueChange={(value) =>
                setDraftCanonicalId(value === '__none__' ? '' : value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {tRoot('no_template_option')}
                </SelectItem>
                {activeTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {errorMessage ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
              {errorMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={isPending} onClick={onSave}>
              {tRoot('save_connection_action')}
            </Button>
            <Button
              variant="outline"
              disabled={!draftCanonicalId || isPending}
              onClick={() => setDraftCanonicalId('')}
            >
              {tRoot('disconnect_action')}
            </Button>
          </div>
          <HistoryList audits={selectedAudits} />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {tRoot('no_workspace_selected_description')}
        </p>
      )}
    </section>
  );
}
