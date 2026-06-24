'use client';

import { Play, Radio, RefreshCw } from '@tuturuuu/icons';
import type {
  InfrastructureProject,
  UpdateInfrastructureProjectPayload,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { formatDateTime } from './formatters';
import { EmptyState, LoadingSkeleton, ToneBadge } from './primitives';
import type { MonitoringTone, MonitoringTranslator } from './types';

type ProjectToggleKey =
  | 'autoDeployEnabled'
  | 'cronEnabled'
  | 'logDrainEnabled'
  | 'redisEnabled';

function getProjectStatusTone(
  status: string | null | undefined
): MonitoringTone {
  const value = (status ?? '').toLowerCase();
  if (value.includes('fail') || value.includes('error')) return 'red';
  if (value.includes('queue') || value.includes('pending')) return 'amber';
  if (value.includes('deploy') || value.includes('build')) return 'blue';
  if (value.includes('ready') || value.includes('success')) return 'green';
  return 'muted';
}

export function ProjectsPanel({
  activeProjectId,
  createError,
  isCreating,
  isLoading,
  isMutating,
  onCreateProject,
  onDeployProject,
  onSelectProject,
  onSyncProject,
  onUpdateProject,
  projects,
  t,
}: {
  activeProjectId: string;
  createError: string | undefined;
  isCreating: boolean;
  isLoading: boolean;
  isMutating: boolean;
  onCreateProject: (payload: {
    appRoot?: string;
    hostnames?: string[];
    repoUrl: string;
  }) => void;
  onDeployProject: (project: InfrastructureProject) => void;
  onSelectProject: (projectId: string) => void;
  onSyncProject: (project: InfrastructureProject) => void;
  onUpdateProject: (
    project: InfrastructureProject,
    payload: UpdateInfrastructureProjectPayload
  ) => void;
  projects: InfrastructureProject[];
  t: MonitoringTranslator;
}) {
  const [repoUrl, setRepoUrl] = useState('');
  const [hostnames, setHostnames] = useState('');
  const [appRoot, setAppRoot] = useState('');

  const submit = () => {
    const trimmedRepoUrl = repoUrl.trim();
    if (!trimmedRepoUrl) {
      return;
    }

    onCreateProject({
      appRoot: appRoot.trim() || undefined,
      hostnames: hostnames
        .split(',')
        .map((hostname) => hostname.trim())
        .filter(Boolean),
      repoUrl: trimmedRepoUrl,
    });
    setRepoUrl('');
    setHostnames('');
    setAppRoot('');
  };

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="grid gap-3 border-border border-b p-4 lg:grid-cols-[minmax(0,1fr)_180px_260px_auto]">
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">
            {t('projects.repo_url')}
          </span>
          <Input
            className="h-9"
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder={t('projects.repo_url')}
            value={repoUrl}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">
            {t('projects.app_root')}
          </span>
          <Input
            className="h-9"
            onChange={(event) => setAppRoot(event.target.value)}
            placeholder={t('projects.repo_root')}
            value={appRoot}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">
            {t('projects.hostnames')}
          </span>
          <Input
            className="h-9"
            onChange={(event) => setHostnames(event.target.value)}
            placeholder={t('projects.hostnames')}
            value={hostnames}
          />
        </label>
        <div className="flex items-end">
          <Button
            className="h-9"
            disabled={isCreating || !repoUrl.trim()}
            onClick={submit}
            type="button"
          >
            {t('projects.import')}
          </Button>
        </div>
      </div>
      {createError ? (
        <p className="border-border border-b px-4 py-3 text-dynamic-red text-sm">
          {createError}
        </p>
      ) : null}
      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : projects.length === 0 ? (
        <EmptyState label={t('projects.empty')} />
      ) : (
        <div className="divide-y divide-border">
          {projects.map((project) => (
            <ProjectRow
              active={project.id === activeProjectId}
              disabled={isMutating}
              key={project.id}
              onDeploy={() => onDeployProject(project)}
              onSelect={() => onSelectProject(project.id)}
              onSync={() => onSyncProject(project)}
              onUpdate={(payload) => onUpdateProject(project, payload)}
              project={project}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectRow({
  active,
  disabled,
  onDeploy,
  onSelect,
  onSync,
  onUpdate,
  project,
  t,
}: {
  active: boolean;
  disabled: boolean;
  onDeploy: () => void;
  onSelect: () => void;
  onSync: () => void;
  onUpdate: (payload: UpdateInfrastructureProjectPayload) => void;
  project: InfrastructureProject;
  t: MonitoringTranslator;
}) {
  const statusTone = getProjectStatusTone(project.deploymentStatus);
  const toggles = [
    {
      checked: project.autoDeployEnabled,
      key: 'autoDeployEnabled',
      label: t('projects.auto_deploy'),
    },
    {
      checked: project.addons.logDrain,
      key: 'logDrainEnabled',
      label: t('projects.log_drain'),
    },
    {
      checked: project.addons.redis,
      key: 'redisEnabled',
      label: t('projects.redis'),
    },
    {
      checked: project.addons.cron,
      key: 'cronEnabled',
      label: t('projects.cron'),
    },
  ] satisfies Array<{
    checked: boolean;
    key: ProjectToggleKey;
    label: string;
  }>;

  return (
    <article
      className={cn(
        'grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.8fr)_minmax(260px,1fr)]',
        active && 'bg-dynamic-blue/5'
      )}
    >
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="truncate text-left font-semibold text-sm"
            onClick={onSelect}
            type="button"
          >
            {project.name}
          </button>
          {project.isBuiltin ? (
            <Badge variant="secondary">{t('projects.builtin')}</Badge>
          ) : null}
          <ToneBadge tone={statusTone}>{project.deploymentStatus}</ToneBadge>
          {active ? <Badge variant="outline">{t('scope.active')}</Badge> : null}
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {project.repo.url}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant={project.addons.logDrain ? 'default' : 'secondary'}>
            {t('projects.log_drain')}
          </Badge>
          <Badge variant={project.addons.redis ? 'default' : 'secondary'}>
            {t('projects.redis')}
          </Badge>
          <Badge variant={project.addons.cron ? 'default' : 'secondary'}>
            {t('projects.cron')}
          </Badge>
          <Badge variant="secondary">{t('projects.proxy_locked')}</Badge>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">
              {t('projects.latest_commit')}
            </span>
            <p className="truncate font-mono">
              {project.latestCommitShortHash ?? '-'}{' '}
              <span className="font-sans font-semibold">
                {project.latestCommitSubject ?? ''}
              </span>
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t('projects.synced')}
            </span>
            <p>{formatDateTime(project.latestSyncedAt)}</p>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            {t('projects.branch')}
          </span>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            disabled={disabled}
            onChange={(event) =>
              onUpdate({ selectedBranch: event.target.value })
            }
            value={project.selectedBranch}
          >
            {project.branches.length === 0 ? (
              <option value={project.selectedBranch}>
                {project.selectedBranch}
              </option>
            ) : null}
            {project.branches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <BlurInput
          disabled={disabled}
          label={t('projects.app_root')}
          onCommit={(value) => onUpdate({ appRoot: value })}
          value={project.appRoot}
        />
        <BlurInput
          disabled={disabled}
          label={t('projects.hostnames')}
          onCommit={(value) =>
            onUpdate({
              hostnames: value
                .split(',')
                .map((hostname) => hostname.trim())
                .filter(Boolean),
            })
          }
          value={project.hostnames.join(', ')}
        />
      </div>
      <div className="space-y-3">
        {toggles.map(({ checked, key, label }) => (
          <div
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            key={key}
          >
            <span>{label}</span>
            <Switch
              checked={checked}
              disabled={disabled}
              onCheckedChange={(enabled) => onUpdate({ [key]: enabled })}
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {!active ? (
            <Button
              onClick={onSelect}
              size="sm"
              type="button"
              variant="outline"
            >
              <Radio className="h-4 w-4" />
              {t('scope.use')}
            </Button>
          ) : null}
          <Button
            disabled={disabled}
            onClick={onSync}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            {t('projects.sync')}
          </Button>
          <Button
            disabled={disabled}
            onClick={onDeploy}
            size="sm"
            type="button"
          >
            <Play className="h-4 w-4" />
            {t('projects.deploy')}
          </Button>
        </div>
      </div>
    </article>
  );
}

function BlurInput({
  disabled,
  label,
  onCommit,
  value,
}: {
  disabled: boolean;
  label: string;
  onCommit: (value: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Input
        className="h-9"
        disabled={disabled}
        onBlur={() => {
          if (draft !== value) {
            onCommit(draft);
          }
        }}
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
    </label>
  );
}
