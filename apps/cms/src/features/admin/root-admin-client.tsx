'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Link,
  Plus,
  Search,
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
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import {
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS,
  EXTERNAL_PROJECT_ADAPTER_OPTIONS,
} from '@/lib/external-projects/constants';
import {
  EmptyPanel,
  formatAuditTime,
  formatCanonicalToken,
  getWorkspaceLabel,
  MetricCard,
  ProjectRegistryCard,
  WorkspaceStatusBadge,
  WorkspaceSummaryButton,
} from './root-admin-components';

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

function workspaceMatchesQuery(
  workspace: ExternalProjectWorkspaceBindingSummary,
  query: string
) {
  if (!query) {
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
    .some((value) => value?.toLowerCase().includes(query));
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
  const [addWorkspaceSearchQuery, setAddWorkspaceSearchQuery] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    initialBindings.find((workspace) => workspace.binding.enabled)?.id ?? ''
  );
  const [bindingForm, setBindingForm] = useState(() => {
    const selectedWorkspace =
      initialBindings.find(
        (workspace) => workspace.id === selectedWorkspaceId
      ) ?? null;

    return {
      canonicalId: selectedWorkspace?.binding.canonical_id ?? '',
      workspaceId: selectedWorkspace?.id ?? '',
    };
  });

  const deferredProjectSearchQuery = useDeferredValue(projectSearchQuery);
  const deferredWorkspaceSearchQuery = useDeferredValue(workspaceSearchQuery);
  const deferredAddWorkspaceSearchQuery = useDeferredValue(
    addWorkspaceSearchQuery
  );
  const normalizedProjectQuery = deferredProjectSearchQuery
    .trim()
    .toLowerCase();
  const normalizedWorkspaceQuery = deferredWorkspaceSearchQuery
    .trim()
    .toLowerCase();
  const normalizedAddWorkspaceQuery = deferredAddWorkspaceSearchQuery
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
  const enabledBindings = initialBindings.filter(
    (workspace) => workspace.binding.enabled
  );
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
  const filteredBindings = enabledBindings.filter((workspace) =>
    workspaceMatchesQuery(workspace, normalizedWorkspaceQuery)
  );
  const addableWorkspaceMatches = normalizedAddWorkspaceQuery
    ? initialBindings
        .filter((workspace) => !workspace.binding.enabled)
        .filter((workspace) =>
          workspaceMatchesQuery(workspace, normalizedAddWorkspaceQuery)
        )
        .slice(0, 8)
    : [];
  const selectedWorkspaceAudits = selectedWorkspace
    ? initialAudits.filter(
        (audit) => audit.destination_ws_id === selectedWorkspace.id
      )
    : [];

  const selectWorkspace = ({
    preferFirstActiveProject = false,
    workspace,
  }: {
    preferFirstActiveProject?: boolean;
    workspace: ExternalProjectWorkspaceBindingSummary;
  }) => {
    setSelectedWorkspaceId(workspace.id);
    setBindingForm({
      canonicalId: preferFirstActiveProject
        ? (activeProjects[0]?.id ?? workspace.binding.canonical_id ?? '')
        : (workspace.binding.canonical_id ?? ''),
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
      <section className="overflow-hidden rounded-3xl border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/10 via-background to-dynamic-green/10 shadow-sm">
        <div className="grid gap-6 p-6 xl:grid-cols-[1.1fr_0.9fr] xl:p-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-background/70 px-3 py-1 text-dynamic-blue text-xs uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              {tRoot('overview_title')}
            </div>
            <div className="space-y-2">
              <h1 className="max-w-2xl font-semibold text-3xl">
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
              tone="blue"
            />
            <MetricCard
              label={tRoot('active_projects_label')}
              value={String(activeProjects.length)}
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="green"
            />
            <MetricCard
              label={tRoot('live_bindings_label')}
              value={String(activeBindingCount)}
              icon={<Link className="h-4 w-4" />}
              tone="orange"
            />
            <MetricCard
              label={tRoot('adapter_coverage_label')}
              value={`${adapterCoverageCount}/${EXTERNAL_PROJECT_ADAPTER_OPTIONS.length}`}
              icon={<Sparkles className="h-4 w-4" />}
              tone="purple"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-6">
          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle>{tRoot('enabled_workspaces_title')}</CardTitle>
                  <CardDescription>
                    {tRoot('enabled_workspaces_description')}
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                >
                  {activeBindingCount} {tRoot('live_bindings_label')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="cms-workspace-search">
                  {t('common.workspace')}
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cms-workspace-search"
                    value={workspaceSearchQuery}
                    onChange={(event) =>
                      setWorkspaceSearchQuery(event.target.value)
                    }
                    placeholder={tRoot('workspace_search_placeholder')}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {filteredBindings.length} {t('common.workspaces')}
                </span>
                <span className="text-dynamic-green">
                  {tRoot('enabled_only_label')}
                </span>
              </div>

              {filteredBindings.length === 0 ? (
                <EmptyPanel
                  title={
                    enabledBindings.length === 0
                      ? tRoot('enabled_workspace_empty_title')
                      : tRoot('workspace_empty_title')
                  }
                  description={
                    enabledBindings.length === 0
                      ? tRoot('enabled_workspace_empty_description')
                      : tRoot('workspace_empty_description')
                  }
                />
              ) : (
                <div className="space-y-3">
                  {filteredBindings.map((workspace) => (
                    <WorkspaceSummaryButton
                      key={workspace.id}
                      workspace={workspace}
                      isSelected={workspace.id === selectedWorkspaceId}
                      onClick={() => selectWorkspace({ workspace })}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-dynamic-orange/20 bg-dynamic-orange/5 shadow-none">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-full border border-dynamic-orange/25 bg-dynamic-orange/10 p-2 text-dynamic-orange">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <CardTitle>{tRoot('add_workspace_title')}</CardTitle>
                  <CardDescription>
                    {tRoot('add_workspace_description')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="cms-add-workspace-search">
                  {tRoot('add_workspace_search_label')}
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cms-add-workspace-search"
                    value={addWorkspaceSearchQuery}
                    onChange={(event) =>
                      setAddWorkspaceSearchQuery(event.target.value)
                    }
                    placeholder={tRoot('add_workspace_search_placeholder')}
                    className="bg-background pl-9"
                  />
                </div>
              </div>

              {!normalizedAddWorkspaceQuery ? (
                <EmptyPanel
                  title={tRoot('add_workspace_idle_title')}
                  description={tRoot('add_workspace_idle_description')}
                />
              ) : addableWorkspaceMatches.length === 0 ? (
                <EmptyPanel
                  title={tRoot('add_workspace_empty_title')}
                  description={tRoot('add_workspace_empty_description')}
                />
              ) : (
                <div className="space-y-3">
                  <div className="text-muted-foreground text-sm">
                    {addableWorkspaceMatches.length} {tRoot('results_label')}
                  </div>
                  {addableWorkspaceMatches.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/90 p-4 text-left transition hover:border-dynamic-orange/35 hover:bg-dynamic-orange/5"
                      onClick={() =>
                        selectWorkspace({
                          preferFirstActiveProject: true,
                          workspace,
                        })
                      }
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="truncate font-medium">
                          {getWorkspaceLabel(
                            workspace,
                            t('common.unnamed-workspace')
                          )}
                        </div>
                        <div className="truncate text-muted-foreground text-sm">
                          {workspace.id}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-dynamic-orange text-sm">
                        {tRoot('select_to_bind_action')}
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/70 bg-card/95 shadow-none">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-full border border-dynamic-blue/25 bg-dynamic-blue/10 p-2 text-dynamic-blue">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <CardTitle>{tRoot('selected_workspace_title')}</CardTitle>
                  <CardDescription>
                    {tRoot('selected_workspace_description')}
                  </CardDescription>
                </div>
              </div>
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
                    <div className="rounded-2xl border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
                      <div className="text-muted-foreground text-xs uppercase">
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
                    <div className="rounded-2xl border border-dynamic-green/20 bg-dynamic-green/5 p-4">
                      <div className="text-muted-foreground text-xs uppercase">
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
                    <div className="rounded-2xl border border-dynamic-purple/20 bg-dynamic-purple/5 p-4">
                      <div className="text-muted-foreground text-xs uppercase">
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
                      <div className="rounded-2xl border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
                        <div className="mb-2 text-muted-foreground text-xs uppercase">
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
                        className="w-full gap-2 bg-dynamic-blue text-white hover:bg-dynamic-blue/90"
                        disabled={bindDisabled}
                        onClick={() => bindMutation.mutate()}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {tRoot('save_action')}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full border-dynamic-orange/30 text-dynamic-orange hover:bg-dynamic-orange/10"
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
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={projectSearchQuery}
                  onChange={(event) =>
                    setProjectSearchQuery(event.target.value)
                  }
                  placeholder={tRoot('root_search_placeholder')}
                  className="pl-9"
                />
              </div>
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
            <div className="rounded-2xl border border-dynamic-purple/20 bg-dynamic-purple/5 p-5">
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
                    className="gap-2 bg-dynamic-purple text-white hover:bg-dynamic-purple/90"
                    disabled={createDisabled}
                    onClick={() => createProjectMutation.mutate()}
                  >
                    <Plus className="h-4 w-4" />
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
