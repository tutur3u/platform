'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Link,
  Sparkles,
} from '@tuturuuu/icons';
import {
  createCanonicalExternalProject,
  updateCanonicalExternalProject,
  updateWorkspaceExternalProjectBinding,
} from '@tuturuuu/internal-api';
import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
  Json,
  WorkspaceExternalProjectBindingAudit,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useDeferredValue, useState } from 'react';
import {
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS,
  EXTERNAL_PROJECT_ADAPTER_OPTIONS,
} from '@/lib/external-projects/constants';

function buildDefaultDeliveryProfile(
  adapter: CanonicalExternalProject['adapter']
) {
  return JSON.stringify(
    {
      adapter,
      deliveryPreset: `${adapter}-default`,
    },
    null,
    2
  );
}

function tryParseJson(value: string): Json | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatCanonicalToken(value: string) {
  return value
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatAuditTime(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString();
}

function getWorkspaceLabel(
  workspace: Pick<ExternalProjectWorkspaceBindingSummary, 'name'>,
  unnamedLabel: string
) {
  return workspace.name || unnamedLabel;
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/55 p-4">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/80 text-muted-foreground">
        {icon}
      </div>
      <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="mt-1 font-semibold text-2xl">{value}</div>
    </div>
  );
}

function EmptyPanel({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border/80 border-dashed bg-background/30 px-4 py-10 text-center">
      <div className="font-medium">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-muted-foreground text-sm leading-6">
        {description}
      </div>
    </div>
  );
}

function WorkspaceStatusBadge({ enabled }: { enabled: boolean }) {
  const t = useTranslations();

  return (
    <Badge variant={enabled ? 'default' : 'outline'} className="rounded-full">
      {enabled ? t('common.enabled') : t('common.disabled')}
    </Badge>
  );
}

function ProjectRegistryCard({
  onPrepareBinding,
  onSave,
  project,
}: {
  onPrepareBinding: () => void;
  onSave: (
    displayName: string,
    isActive: boolean,
    deliveryProfile: Json
  ) => void;
  project: CanonicalExternalProject;
}) {
  const tRoot = useTranslations('external-projects.root');
  const [displayName, setDisplayName] = useState(project.display_name);
  const [isActive, setIsActive] = useState(project.is_active);
  const [deliveryProfileText, setDeliveryProfileText] = useState(
    JSON.stringify(project.delivery_profile ?? {}, null, 2)
  );

  const deliveryProfileJson = tryParseJson(deliveryProfileText);

  return (
    <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full">
              {formatCanonicalToken(project.adapter)}
            </Badge>
            <Badge
              variant={isActive ? 'default' : 'outline'}
              className="rounded-full"
            >
              {isActive ? tRoot('active_label') : tRoot('inactive_label')}
            </Badge>
          </div>
          <div>
            <div className="font-medium text-lg">{project.display_name}</div>
            <div className="text-muted-foreground text-sm">
              {project.id} · {tRoot('adapter_label')}:{' '}
              {formatCanonicalToken(project.adapter)}
            </div>
          </div>
        </div>

        <Button variant="outline" onClick={onPrepareBinding}>
          {tRoot('use_for_binding_action')}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.62fr_0.38fr]">
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>{tRoot('display_name_label')}</Label>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label>{tRoot('delivery_profile_label')}</Label>
              <span className="text-muted-foreground text-xs">
                {tRoot('delivery_profile_hint')}
              </span>
            </div>
            <Textarea
              rows={6}
              value={deliveryProfileText}
              onChange={(event) => setDeliveryProfileText(event.target.value)}
              className={
                deliveryProfileText.trim() && deliveryProfileJson === null
                  ? 'border-destructive/70 focus-visible:ring-destructive/30'
                  : undefined
              }
            />
            {deliveryProfileText.trim() && deliveryProfileJson === null ? (
              <p className="text-destructive text-xs">
                {tRoot('invalid_json_label')}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-card/80 p-4">
            <div className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
              {tRoot('recommended_collections_label')}
            </div>
            <div className="flex flex-wrap gap-2">
              {project.allowed_collections.map((collection) => (
                <Badge
                  key={collection}
                  variant="secondary"
                  className="rounded-full"
                >
                  {formatCanonicalToken(collection)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3">
            <Checkbox
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
              id={`active-${project.id}`}
            />
            <Label htmlFor={`active-${project.id}`}>
              {tRoot('active_label')}
            </Label>
          </div>

          <Button
            className="w-full"
            onClick={() =>
              deliveryProfileJson &&
              onSave(displayName, isActive, deliveryProfileJson)
            }
            disabled={!displayName.trim() || deliveryProfileJson === null}
          >
            {tRoot('save_action')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RootExternalProjectsAdminClient({
  initialAudits,
  initialBindings,
  initialProjects,
}: {
  initialAudits: WorkspaceExternalProjectBindingAudit[];
  initialBindings: ExternalProjectWorkspaceBindingSummary[];
  initialProjects: CanonicalExternalProject[];
}) {
  const t = useTranslations();
  const tRoot = useTranslations('external-projects.root');
  const queryClient = useQueryClient();
  const [createForm, setCreateForm] = useState({
    adapter: 'junly' as CanonicalExternalProject['adapter'],
    deliveryProfile: buildDefaultDeliveryProfile('junly'),
    displayName: '',
    id: '',
  });
  const [adapterFilter, setAdapterFilter] = useState('all');
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    initialBindings.find((workspace) => workspace.binding.canonical_id)?.id ??
      initialBindings[0]?.id ??
      ''
  );
  const [bindingForm, setBindingForm] = useState(() => {
    const selectedWorkspace =
      initialBindings.find(
        (workspace) => workspace.id === selectedWorkspaceId
      ) ??
      initialBindings[0] ??
      null;

    return {
      canonicalId: selectedWorkspace?.binding.canonical_id ?? '',
      workspaceId: selectedWorkspace?.id ?? '',
    };
  });

  const deferredProjectSearchQuery = useDeferredValue(projectSearchQuery);
  const deferredWorkspaceSearchQuery = useDeferredValue(workspaceSearchQuery);
  const normalizedProjectQuery = deferredProjectSearchQuery
    .trim()
    .toLowerCase();
  const normalizedWorkspaceQuery = deferredWorkspaceSearchQuery
    .trim()
    .toLowerCase();
  const createPayloadJson = tryParseJson(createForm.deliveryProfile);
  const activeProjects = initialProjects.filter((project) => project.is_active);
  const selectedWorkspace =
    initialBindings.find((workspace) => workspace.id === selectedWorkspaceId) ??
    null;
  const currentBindingProject =
    initialProjects.find(
      (project) =>
        project.id ===
        (bindingForm.canonicalId || selectedWorkspace?.binding.canonical_id)
    ) ?? null;
  const selectableProjects =
    currentBindingProject &&
    !activeProjects.some((project) => project.id === currentBindingProject.id)
      ? [currentBindingProject, ...activeProjects]
      : activeProjects;
  const activeBindingCount = initialBindings.filter(
    (workspace) => workspace.binding.enabled
  ).length;
  const adapterCoverageCount = new Set(
    initialProjects.map((project) => project.adapter)
  ).size;
  const filteredProjects = initialProjects.filter((project) => {
    const matchesAdapter =
      adapterFilter === 'all' || project.adapter === adapterFilter;
    const matchesQuery =
      !normalizedProjectQuery ||
      project.id.toLowerCase().includes(normalizedProjectQuery) ||
      project.display_name.toLowerCase().includes(normalizedProjectQuery);

    return matchesAdapter && matchesQuery;
  });
  const filteredBindings = initialBindings.filter((workspace) => {
    if (!normalizedWorkspaceQuery) {
      return true;
    }

    return [
      workspace.id,
      workspace.name,
      workspace.binding.canonical_id,
      workspace.binding.canonical_project?.display_name,
      workspace.binding.adapter,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedWorkspaceQuery));
  });
  const selectedWorkspaceAudits = selectedWorkspace
    ? initialAudits.filter(
        (audit) => audit.destination_ws_id === selectedWorkspace.id
      )
    : [];

  const selectWorkspace = (
    workspace: ExternalProjectWorkspaceBindingSummary
  ) => {
    setSelectedWorkspaceId(workspace.id);
    setBindingForm({
      canonicalId: workspace.binding.canonical_id ?? '',
      workspaceId: workspace.id,
    });
  };

  const createProjectMutation = useMutation({
    mutationFn: async () =>
      createCanonicalExternalProject({
        adapter: createForm.adapter,
        allowed_collections:
          DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[createForm.adapter],
        allowed_features: [],
        delivery_profile: createPayloadJson ?? {},
        display_name: createForm.displayName,
        id: createForm.id,
        is_active: true,
        metadata: {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  const bindMutation = useMutation({
    mutationFn: async () =>
      updateWorkspaceExternalProjectBinding(
        bindingForm.workspaceId,
        bindingForm.canonicalId || null
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({
      deliveryProfile,
      displayName,
      id,
      isActive,
    }: {
      deliveryProfile: Json;
      displayName: string;
      id: string;
      isActive: boolean;
    }) =>
      updateCanonicalExternalProject(id, {
        delivery_profile: deliveryProfile,
        display_name: displayName,
        is_active: isActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  const createDisabled =
    !createForm.id.trim() ||
    !createForm.displayName.trim() ||
    createPayloadJson === null ||
    createProjectMutation.isPending;
  const bindDisabled =
    !bindingForm.workspaceId.trim() ||
    bindingForm.canonicalId ===
      (selectedWorkspace?.binding.canonical_id ?? '') ||
    bindMutation.isPending;
  const unbindDisabled =
    !selectedWorkspace?.binding.canonical_id || bindMutation.isPending;

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-3xl border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.9))] shadow-sm">
        <div className="grid gap-6 p-6 xl:grid-cols-[1.1fr_0.9fr] xl:p-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-muted-foreground text-xs uppercase tracking-[0.24em]">
              <Sparkles className="h-3.5 w-3.5" />
              {tRoot('overview_title')}
            </div>
            <div className="space-y-2">
              <h1 className="max-w-2xl font-semibold text-3xl tracking-tight">
                {tRoot('registry_title')}
              </h1>
              <p className="max-w-2xl text-muted-foreground text-sm leading-6">
                {tRoot('overview_description')}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label={tRoot('total_projects_label')}
              value={String(initialProjects.length)}
              icon={<BriefcaseBusiness className="h-4 w-4" />}
            />
            <MetricCard
              label={tRoot('active_projects_label')}
              value={String(activeProjects.length)}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <MetricCard
              label={tRoot('live_bindings_label')}
              value={String(activeBindingCount)}
              icon={<Link className="h-4 w-4" />}
            />
            <MetricCard
              label={tRoot('adapter_coverage_label')}
              value={`${adapterCoverageCount}/${EXTERNAL_PROJECT_ADAPTER_OPTIONS.length}`}
              icon={<Sparkles className="h-4 w-4" />}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardHeader>
            <CardTitle>{tRoot('workspace_list_title')}</CardTitle>
            <CardDescription>
              {tRoot('workspace_list_description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="cms-workspace-search">
                {t('common.workspace')}
              </Label>
              <Input
                id="cms-workspace-search"
                value={workspaceSearchQuery}
                onChange={(event) =>
                  setWorkspaceSearchQuery(event.target.value)
                }
                placeholder={tRoot('workspace_search_placeholder')}
              />
            </div>

            <div className="text-muted-foreground text-sm">
              {filteredBindings.length} {t('common.workspaces')}
            </div>

            {filteredBindings.length === 0 ? (
              <EmptyPanel
                title={tRoot('workspace_empty_title')}
                description={tRoot('workspace_empty_description')}
              />
            ) : (
              <div className="space-y-3">
                {filteredBindings.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    className={cn(
                      'w-full rounded-[1.35rem] border p-4 text-left transition-colors',
                      workspace.id === selectedWorkspaceId
                        ? 'border-foreground/15 bg-background'
                        : 'border-border/70 bg-background/75 hover:border-foreground/15'
                    )}
                    onClick={() => selectWorkspace(workspace)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">
                            {getWorkspaceLabel(
                              workspace,
                              t('common.unnamed-workspace')
                            )}
                          </div>
                          <WorkspaceStatusBadge
                            enabled={workspace.binding.enabled}
                          />
                          {workspace.personal ? (
                            <Badge variant="secondary" className="rounded-full">
                              {t('common.personal_account')}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {workspace.binding.canonical_project?.display_name ??
                            workspace.binding.canonical_id ??
                            tRoot('unbound_label')}
                        </div>
                      </div>

                      <div className="space-y-2 text-right text-muted-foreground text-xs">
                        <div>
                          {workspace.binding.adapter
                            ? formatCanonicalToken(workspace.binding.adapter)
                            : tRoot('unbound_label')}
                        </div>
                        <div>{formatAuditTime(workspace.last_changed_at)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <CardTitle>{tRoot('selected_workspace_title')}</CardTitle>
              <CardDescription>
                {tRoot('selected_workspace_description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!selectedWorkspace ? (
                <EmptyPanel
                  title={tRoot('no_workspace_selected_title')}
                  description={tRoot('no_workspace_selected_description')}
                />
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                      <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                        {t('common.workspace')}
                      </div>
                      <div className="mt-2 font-medium text-lg">
                        {getWorkspaceLabel(
                          selectedWorkspace,
                          t('common.unnamed-workspace')
                        )}
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {selectedWorkspace.id}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                      <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                        {tRoot('binding_preview_label')}
                      </div>
                      <div className="mt-2 font-medium text-lg">
                        {selectedWorkspace.binding.canonical_project
                          ?.display_name ??
                          selectedWorkspace.binding.canonical_id ??
                          tRoot('unbound_label')}
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {selectedWorkspace.binding.adapter
                          ? formatCanonicalToken(
                              selectedWorkspace.binding.adapter
                            )
                          : tRoot('unbound_label')}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                      <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                        {tRoot('last_changed_label')}
                      </div>
                      <div className="mt-2 font-medium text-lg">
                        {formatAuditTime(selectedWorkspace.last_changed_at)}
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {selectedWorkspace.last_actor_user_id ?? '—'}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[0.72fr_0.28fr]">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="font-medium">{tRoot('bind_title')}</div>
                        <div className="text-muted-foreground text-sm">
                          {tRoot('bind_description')}
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label>{tRoot('canonical_id_label')}</Label>
                        <Select
                          value={bindingForm.canonicalId || '__unbound__'}
                          onValueChange={(value) =>
                            setBindingForm((current) => ({
                              ...current,
                              canonicalId: value === '__unbound__' ? '' : value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unbound__">
                              {tRoot('unbound_label')}
                            </SelectItem>
                            {selectableProjects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.display_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label>{tRoot('workspace_id_label')}</Label>
                        <Input value={selectedWorkspace.id} disabled />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                        <div className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                          {tRoot('binding_preview_label')}
                        </div>
                        <div className="space-y-2">
                          <div className="font-medium">
                            {currentBindingProject?.display_name ??
                              tRoot('unbound_label')}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <WorkspaceStatusBadge
                              enabled={Boolean(bindingForm.canonicalId)}
                            />
                            {currentBindingProject?.adapter ? (
                              <Badge
                                variant="secondary"
                                className="rounded-full"
                              >
                                {formatCanonicalToken(
                                  currentBindingProject.adapter
                                )}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        disabled={bindDisabled}
                        onClick={() => bindMutation.mutate()}
                      >
                        {tRoot('save_action')}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={unbindDisabled}
                        onClick={() =>
                          setBindingForm((current) => ({
                            ...current,
                            canonicalId: '',
                          }))
                        }
                      >
                        {tRoot('unbind_action')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <CardTitle>{tRoot('recent_audits_title')}</CardTitle>
              <CardDescription>
                {tRoot('audit_feed_description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedWorkspaceAudits.length === 0 ? (
                <EmptyPanel
                  title={tRoot('no_audits_title')}
                  description={tRoot('no_audits_description')}
                />
              ) : (
                <div className="space-y-3">
                  {selectedWorkspaceAudits.map((audit) => (
                    <div
                      key={audit.id}
                      className="rounded-xl border border-border/70 bg-background/40 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="rounded-full">
                              {audit.next_canonical_id
                                ? tRoot('bind_action')
                                : tRoot('unbind_action')}
                            </Badge>
                            <span className="font-medium">
                              {audit.previous_canonical_id ??
                                tRoot('unbound_label')}
                              {' -> '}
                              {audit.next_canonical_id ??
                                tRoot('unbound_label')}
                            </span>
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {audit.source_ws_id}
                            {audit.actor_user_id
                              ? ` · ${audit.actor_user_id}`
                              : ''}
                          </div>
                        </div>
                        <div className="inline-flex items-center gap-2 text-muted-foreground text-xs">
                          <Clock className="h-3.5 w-3.5" />
                          {formatAuditTime(audit.changed_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardHeader className="gap-4 lg:flex lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>{tRoot('registry_title')}</CardTitle>
            <CardDescription>{tRoot('registry_description')}</CardDescription>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{tRoot('root_search_placeholder')}</Label>
              <Input
                value={projectSearchQuery}
                onChange={(event) => setProjectSearchQuery(event.target.value)}
                placeholder={tRoot('root_search_placeholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label>{tRoot('adapter_label')}</Label>
              <Select value={adapterFilter} onValueChange={setAdapterFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {tRoot('all_adapters_label')}
                  </SelectItem>
                  {EXTERNAL_PROJECT_ADAPTER_OPTIONS.map((adapter) => (
                    <SelectItem key={adapter} value={adapter}>
                      {formatCanonicalToken(adapter)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.38fr_0.62fr]">
            <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="font-medium">{tRoot('create_title')}</div>
                  <div className="text-muted-foreground text-sm">
                    {tRoot('create_description')}
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>{tRoot('display_name_label')}</Label>
                    <Input
                      value={createForm.displayName}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>{tRoot('canonical_id_label')}</Label>
                    <Input
                      value={createForm.id}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          id: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>{tRoot('adapter_label')}</Label>
                    <Select
                      value={createForm.adapter}
                      onValueChange={(value) =>
                        setCreateForm((current) => ({
                          ...current,
                          adapter: value as CanonicalExternalProject['adapter'],
                          deliveryProfile: buildDefaultDeliveryProfile(
                            value as CanonicalExternalProject['adapter']
                          ),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXTERNAL_PROJECT_ADAPTER_OPTIONS.map((adapter) => (
                          <SelectItem key={adapter} value={adapter}>
                            {formatCanonicalToken(adapter)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>{tRoot('delivery_profile_label')}</Label>
                      <span className="text-muted-foreground text-xs">
                        {tRoot('delivery_profile_hint')}
                      </span>
                    </div>
                    <Textarea
                      rows={8}
                      value={createForm.deliveryProfile}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          deliveryProfile: event.target.value,
                        }))
                      }
                      className={
                        createForm.deliveryProfile.trim() &&
                        createPayloadJson === null
                          ? 'border-destructive/70 focus-visible:ring-destructive/30'
                          : undefined
                      }
                    />
                    {createForm.deliveryProfile.trim() &&
                    createPayloadJson === null ? (
                      <p className="text-destructive text-xs">
                        {tRoot('invalid_json_label')}
                      </p>
                    ) : null}
                  </div>

                  <Button
                    disabled={createDisabled}
                    onClick={() => createProjectMutation.mutate()}
                  >
                    {tRoot('create_action')}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-muted-foreground text-sm">
                {filteredProjects.length} {tRoot('results_label')}
              </div>

              {filteredProjects.length === 0 ? (
                <EmptyPanel
                  title={tRoot('search_empty_title')}
                  description={tRoot('search_empty_description')}
                />
              ) : (
                <div className="space-y-4">
                  {filteredProjects.map((project) => (
                    <ProjectRegistryCard
                      key={project.id}
                      project={project}
                      onPrepareBinding={() => {
                        if (!selectedWorkspace) {
                          return;
                        }

                        setBindingForm({
                          canonicalId: project.id,
                          workspaceId: selectedWorkspace.id,
                        });
                      }}
                      onSave={(displayName, isActive, deliveryProfile) =>
                        updateProjectMutation.mutate({
                          deliveryProfile,
                          displayName,
                          id: project.id,
                          isActive,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
