'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  CheckCircle2,
  RefreshCw,
  Settings2,
  Unlink,
} from '@tuturuuu/icons';
import {
  createCanonicalExternalProject,
  listCanonicalExternalProjects,
  listExternalProjectWorkspaceBindings,
  listWorkspaceExternalProjectBindingAudits,
  updateCanonicalExternalProject,
  updateWorkspaceExternalProjectBinding,
} from '@tuturuuu/internal-api';
import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
  WorkspaceExternalProjectBindingAudit,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { type ReactNode, useDeferredValue, useMemo, useState } from 'react';
import { RootAdminProjectDialog } from './root-admin-project-dialog';
import { RootAdminProjects } from './root-admin-projects';
import { RootAdminTemplateDialog } from './root-admin-template-dialog';
import type { TemplateMutationPayload } from './root-admin-template-types';
import {
  type ProjectStatusFilter,
  type ProjectViewMode,
  sortProjectsByConnection,
  workspaceMatchesAdapter,
  workspaceMatchesQuery,
  workspaceMatchesStatus,
} from './root-admin-utils';

const ROOT_ADMIN_QUERY_KEYS = {
  audits: ['cms-root-admin', 'audits'] as const,
  bindings: ['cms-root-admin', 'bindings'] as const,
  templates: ['cms-root-admin', 'templates'] as const,
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
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
  const [projectQuery, setProjectQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all');
  const [adapterFilter, setAdapterFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ProjectViewMode>('grid');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null
  );
  const [draftConnections, setDraftConnections] = useState<
    Record<string, string>
  >({});
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const deferredProjectQuery = useDeferredValue(projectQuery);

  const templatesQuery = useQuery({
    queryKey: ROOT_ADMIN_QUERY_KEYS.templates,
    queryFn: () => listCanonicalExternalProjects(),
    initialData: initialProjects,
  });
  const bindingsQuery = useQuery({
    queryKey: ROOT_ADMIN_QUERY_KEYS.bindings,
    queryFn: () => listExternalProjectWorkspaceBindings(),
    initialData: initialBindings,
  });
  const auditsQuery = useQuery({
    queryKey: ROOT_ADMIN_QUERY_KEYS.audits,
    queryFn: () => listWorkspaceExternalProjectBindingAudits(),
    initialData: initialAudits,
  });

  const templates = templatesQuery.data ?? initialProjects;
  const audits = auditsQuery.data ?? initialAudits;
  const siteProjects = useMemo(
    () =>
      sortProjectsByConnection(
        (bindingsQuery.data ?? initialBindings).filter(
          (workspace) => workspace.id !== ROOT_WORKSPACE_ID
        )
      ),
    [bindingsQuery.data, initialBindings]
  );
  const filteredProjects = useMemo(() => {
    const normalizedQuery = deferredProjectQuery.trim().toLowerCase();

    return siteProjects.filter(
      (workspace) =>
        workspaceMatchesQuery(workspace, normalizedQuery) &&
        workspaceMatchesStatus(workspace, statusFilter) &&
        workspaceMatchesAdapter(workspace, adapterFilter)
    );
  }, [adapterFilter, deferredProjectQuery, siteProjects, statusFilter]);
  const selectedWorkspace =
    siteProjects.find((workspace) => workspace.id === selectedWorkspaceId) ??
    null;
  const draftCanonicalId = selectedWorkspace
    ? (draftConnections[selectedWorkspace.id] ??
      selectedWorkspace.binding.canonical_id ??
      '')
    : '';
  const activeTemplates = templates.filter((project) => project.is_active);
  const connectedCount = siteProjects.filter(
    (workspace) => workspace.binding.enabled
  ).length;
  const unconnectedCount = siteProjects.length - connectedCount;

  const invalidateTemplates = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ROOT_ADMIN_QUERY_KEYS.templates,
      }),
      queryClient.invalidateQueries({
        queryKey: ROOT_ADMIN_QUERY_KEYS.bindings,
      }),
    ]);
  };
  const invalidateConnections = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ROOT_ADMIN_QUERY_KEYS.bindings,
      }),
      queryClient.invalidateQueries({
        queryKey: ROOT_ADMIN_QUERY_KEYS.audits,
      }),
    ]);
  };

  const createTemplateMutation = useMutation({
    mutationFn: (payload: TemplateMutationPayload) =>
      createCanonicalExternalProject(payload),
    onSuccess: async () => {
      await invalidateTemplates();
    },
  });
  const updateTemplateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<TemplateMutationPayload>;
    }) => updateCanonicalExternalProject(id, payload),
    onSuccess: async () => {
      await invalidateTemplates();
    },
  });
  const updateConnectionMutation = useMutation({
    mutationFn: ({
      canonicalId,
      workspaceId,
    }: {
      canonicalId: string | null;
      workspaceId: string;
    }) => updateWorkspaceExternalProjectBinding(workspaceId, canonicalId),
    onSuccess: async (_binding, variables) => {
      setDraftConnections((current) => {
        const next = { ...current };
        delete next[variables.workspaceId];
        return next;
      });
      await invalidateConnections();
    },
  });

  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-lg border border-border/70 bg-card/90 p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="text-muted-foreground text-sm">
              {tRoot('projects_badge')}
            </div>
            <h1 className="text-balance font-semibold text-3xl">
              {tRoot('projects_title')}
            </h1>
            <p className="text-muted-foreground text-sm leading-6">
              {tRoot('projects_description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                void bindingsQuery.refetch();
                void templatesQuery.refetch();
                void auditsQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              {tRoot('refresh_action')}
            </Button>
            <Button
              className="gap-2"
              onClick={() => setTemplateDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              {tRoot('manage_templates_action')}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<BriefcaseBusiness className="h-4 w-4" />}
            label={tRoot('total_site_projects_label')}
            value={String(siteProjects.length)}
          />
          <MetricCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label={tRoot('connected_projects_label')}
            value={String(connectedCount)}
          />
          <MetricCard
            icon={<Unlink className="h-4 w-4" />}
            label={tRoot('unconnected_projects_label')}
            value={String(unconnectedCount)}
          />
          <MetricCard
            icon={<Settings2 className="h-4 w-4" />}
            label={tRoot('total_templates_label')}
            value={`${activeTemplates.length}/${templates.length}`}
          />
        </div>
      </section>

      <RootAdminProjects
        adapterFilter={adapterFilter}
        onAdapterFilterChange={setAdapterFilter}
        onOpenProject={(workspaceId) => setSelectedWorkspaceId(workspaceId)}
        onQueryChange={setProjectQuery}
        onStatusFilterChange={setStatusFilter}
        onViewModeChange={setViewMode}
        projects={filteredProjects}
        query={projectQuery}
        statusFilter={statusFilter}
        strings={{
          allSiteTypes: tRoot('all_site_types_label'),
          allStatus: tRoot('all_projects_label'),
          connectedStatus: tRoot('connected_status_label'),
          emptyDescription: tRoot('project_empty_description'),
          emptyTitle: tRoot('project_empty_title'),
          gridView: tRoot('grid_view_label'),
          internalIdLabel: tRoot('internal_id_label'),
          lastChangedLabel: tRoot('last_changed_label'),
          listView: tRoot('list_view_label'),
          openProjectAction: tRoot('open_project_action'),
          personalLabel: t('common.personal_account'),
          projectCountLabel: tRoot('project_count_label'),
          searchLabel: tRoot('project_search_label'),
          searchPlaceholder: tRoot('project_search_placeholder'),
          siteTypeLabel: tRoot('site_type_label'),
          statusLabel: tRoot('status_label'),
          templateLabel: tRoot('template_label'),
          unboundLabel: tRoot('unbound_label'),
          unconnectedStatus: tRoot('unconnected_status_label'),
          unnamedWorkspace: t('common.unnamed-workspace'),
        }}
        templates={templates}
        viewMode={viewMode}
      />

      <RootAdminProjectDialog
        audits={audits}
        connectionError={getErrorMessage(updateConnectionMutation.error)}
        draftCanonicalId={draftCanonicalId}
        isSavingConnection={updateConnectionMutation.isPending}
        onDraftCanonicalIdChange={(value) => {
          if (!selectedWorkspace) return;
          setDraftConnections((current) => ({
            ...current,
            [selectedWorkspace.id]: value,
          }));
        }}
        onOpenChange={(open) => {
          if (!open) setSelectedWorkspaceId(null);
        }}
        onSaveConnection={() => {
          if (!selectedWorkspace) return;
          updateConnectionMutation.mutate({
            canonicalId: draftCanonicalId || null,
            workspaceId: selectedWorkspace.id,
          });
        }}
        open={Boolean(selectedWorkspace)}
        strings={{
          auditEmptyDescription: tRoot('history_empty_description'),
          auditEmptyTitle: tRoot('history_empty_title'),
          changeHistoryTitle: tRoot('history_title'),
          connectedStatus: tRoot('connected_status_label'),
          connectionErrorTitle: tRoot('connection_error_title'),
          developerDetailsTitle: tRoot('developer_details_title'),
          disconnectAction: tRoot('disconnect_action'),
          internalIdLabel: tRoot('internal_id_label'),
          lastChangedLabel: tRoot('last_changed_label'),
          noTemplateOption: tRoot('no_template_option'),
          projectDetailsDescription: tRoot('project_details_description'),
          saveConnectionAction: tRoot('save_connection_action'),
          savingAction: tRoot('saving_action'),
          selectedTemplateLabel: tRoot('selected_template_label'),
          siteTypeLabel: tRoot('site_type_label'),
          templateKeyLabel: tRoot('template_key_label'),
          templateLabel: tRoot('template_label'),
          unboundLabel: tRoot('unbound_label'),
          unconnectedStatus: tRoot('unconnected_status_label'),
          unnamedWorkspace: t('common.unnamed-workspace'),
        }}
        templates={templates}
        workspace={selectedWorkspace}
      />

      <RootAdminTemplateDialog
        createError={getErrorMessage(createTemplateMutation.error)}
        isCreating={createTemplateMutation.isPending}
        onCreateTemplate={(payload) => createTemplateMutation.mutate(payload)}
        onOpenChange={setTemplateDialogOpen}
        onUpdateTemplate={(id, payload) =>
          updateTemplateMutation.mutate({ id, payload })
        }
        open={templateDialogOpen}
        strings={{
          activeLabel: tRoot('active_label'),
          allSiteTypes: tRoot('all_site_types_label'),
          createTemplateAction: tRoot('create_template_action'),
          createTemplateDescription: tRoot('create_template_description'),
          createTemplateTitle: tRoot('create_template_title'),
          developerDetailsTitle: tRoot('developer_details_title'),
          developerSettingsHint: tRoot('developer_settings_hint'),
          developerSettingsLabel: tRoot('developer_settings_label'),
          displayNameLabel: tRoot('display_name_label'),
          emptyTemplateDescription: tRoot('template_empty_description'),
          emptyTemplateTitle: tRoot('template_empty_title'),
          inactiveLabel: tRoot('inactive_label'),
          invalidDeveloperSettings: tRoot('invalid_developer_settings_label'),
          recommendedSectionsLabel: tRoot('recommended_sections_label'),
          saveTemplateAction: tRoot('save_template_action'),
          searchPlaceholder: tRoot('template_search_placeholder'),
          siteTypeLabel: tRoot('site_type_label'),
          templateKeyLabel: tRoot('template_key_label'),
          templateManagerDescription: tRoot('template_manager_description'),
          templateManagerTitle: tRoot('template_manager_title'),
        }}
        templates={templates}
        updateError={getErrorMessage(updateTemplateMutation.error)}
        updatingTemplateId={updateTemplateMutation.variables?.id ?? null}
      />
    </div>
  );
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
    <div className="rounded-lg border border-border/70 bg-background/70 p-4">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 text-muted-foreground">
        {icon}
      </div>
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-1 font-semibold text-2xl">{value}</div>
    </div>
  );
}
