'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, RefreshCw } from '@tuturuuu/icons';
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
  Json,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { DEFAULT_EXTERNAL_PROJECT_COLLECTIONS } from '@/lib/external-projects/constants';
import {
  type InternalProjectTemplateForm,
  Metric,
  TemplateFormEditor,
} from './internal-projects-settings-components';
import {
  InternalProjectSearchList,
  SelectedSitePanel,
} from './internal-projects-settings-project-panels';

const ROOT_QUERY_KEYS = {
  audits: ['settings', 'internal-projects', 'audits'] as const,
  bindings: ['settings', 'internal-projects', 'bindings'] as const,
  templates: ['settings', 'internal-projects', 'templates'] as const,
};

function buildDefaultProfile(adapter: CanonicalExternalProject['adapter']) {
  return JSON.stringify(
    { adapter, deliveryPreset: `${adapter}-default` },
    null,
    2
  );
}

function emptyTemplateForm(): InternalProjectTemplateForm {
  return {
    adapter: 'junly',
    deliveryProfile: buildDefaultProfile('junly'),
    displayName: '',
    id: '',
    isActive: true,
  };
}

function formFromTemplate(
  template: CanonicalExternalProject
): InternalProjectTemplateForm {
  return {
    adapter: template.adapter,
    deliveryProfile: JSON.stringify(template.delivery_profile ?? {}, null, 2),
    displayName: template.display_name,
    id: template.id,
    isActive: template.is_active,
  };
}

function parseJson(value: string): Json | null {
  try {
    return JSON.parse(value) as Json;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

export default function InternalProjectsSettings() {
  const tRoot = useTranslations('external-projects.root');
  const queryClient = useQueryClient();
  const [projectQuery, setProjectQuery] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null
  );
  const [draftCanonicalId, setDraftCanonicalId] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [templateForm, setTemplateForm] =
    useState<InternalProjectTemplateForm>(emptyTemplateForm);

  const templatesQuery = useQuery({
    queryKey: ROOT_QUERY_KEYS.templates,
    queryFn: () => listCanonicalExternalProjects(),
  });
  const bindingsQuery = useQuery({
    queryKey: ROOT_QUERY_KEYS.bindings,
    queryFn: () => listExternalProjectWorkspaceBindings(),
  });
  const auditsQuery = useQuery({
    queryKey: ROOT_QUERY_KEYS.audits,
    queryFn: () => listWorkspaceExternalProjectBindingAudits(),
  });

  const templates = templatesQuery.data ?? [];
  const siteProjects = useMemo(
    () =>
      (bindingsQuery.data ?? []).filter(
        (workspace) => workspace.id !== ROOT_WORKSPACE_ID
      ),
    [bindingsQuery.data]
  );
  const audits = auditsQuery.data ?? [];
  const selectedWorkspace =
    siteProjects.find((workspace) => workspace.id === selectedWorkspaceId) ??
    null;
  const selectedAudits = selectedWorkspace
    ? audits.filter((audit) => audit.destination_ws_id === selectedWorkspace.id)
    : [];
  const activeTemplates = templates.filter((template) => template.is_active);
  const connectedCount = siteProjects.filter(
    (workspace) => workspace.binding.enabled
  ).length;
  const filteredProjects = siteProjects.filter((workspace) => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return true;

    return [
      workspace.id,
      workspace.name,
      workspace.binding.canonical_id,
      workspace.binding.canonical_project?.display_name,
      workspace.binding.adapter,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query));
  });
  const parsedProfile = parseJson(templateForm.deliveryProfile);
  const isLoading =
    templatesQuery.isLoading ||
    bindingsQuery.isLoading ||
    auditsQuery.isLoading;

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ROOT_QUERY_KEYS.templates }),
      queryClient.invalidateQueries({ queryKey: ROOT_QUERY_KEYS.bindings }),
      queryClient.invalidateQueries({ queryKey: ROOT_QUERY_KEYS.audits }),
    ]);
  };

  const saveConnectionMutation = useMutation({
    mutationFn: () => {
      if (!selectedWorkspace) throw new Error('No site selected');
      return updateWorkspaceExternalProjectBinding(
        selectedWorkspace.id,
        draftCanonicalId || null
      );
    },
    onSuccess: async () => {
      await invalidateAll();
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () => {
      if (!parsedProfile)
        throw new Error(tRoot('invalid_developer_settings_label'));
      const payload = {
        adapter: templateForm.adapter,
        allowed_collections:
          DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[templateForm.adapter],
        allowed_features: [],
        delivery_profile: parsedProfile,
        display_name: templateForm.displayName,
        id: templateForm.id,
        is_active: templateForm.isActive,
        metadata: {},
      };

      return editingTemplateId
        ? updateCanonicalExternalProject(editingTemplateId, payload)
        : createCanonicalExternalProject(payload);
    },
    onSuccess: async () => {
      await invalidateAll();
      setEditingTemplateId(null);
      setTemplateForm(emptyTemplateForm());
    },
  });

  const openWorkspace = (workspace: ExternalProjectWorkspaceBindingSummary) => {
    setSelectedWorkspaceId(workspace.id);
    setDraftCanonicalId(workspace.binding.canonical_id ?? '');
    saveConnectionMutation.reset();
  };

  const openTemplate = (template: CanonicalExternalProject | null) => {
    setEditingTemplateId(template?.id ?? null);
    setTemplateForm(
      template ? formFromTemplate(template) : emptyTemplateForm()
    );
    saveTemplateMutation.reset();
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="text-muted-foreground text-sm">
            {tRoot('projects_badge')}
          </div>
          <h2 className="font-semibold text-2xl">{tRoot('projects_title')}</h2>
          <p className="max-w-3xl text-muted-foreground text-sm">
            {tRoot('projects_description')}
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={invalidateAll}>
          <RefreshCw className="h-4 w-4" />
          {tRoot('refresh_action')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric
          label={tRoot('total_projects_label')}
          value={siteProjects.length}
        />
        <Metric label={tRoot('live_bindings_label')} value={connectedCount} />
        <Metric
          label={tRoot('total_templates_label')}
          value={templates.length}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <InternalProjectSearchList
          onOpenWorkspace={openWorkspace}
          projectQuery={projectQuery}
          projects={filteredProjects}
          selectedWorkspaceId={selectedWorkspaceId}
          setProjectQuery={setProjectQuery}
        />

        <aside className="space-y-5">
          <SelectedSitePanel
            activeTemplates={activeTemplates}
            draftCanonicalId={draftCanonicalId}
            isPending={saveConnectionMutation.isPending}
            mutationError={saveConnectionMutation.error}
            onSave={() => saveConnectionMutation.mutate()}
            selectedAudits={selectedAudits}
            selectedWorkspace={selectedWorkspace}
            setDraftCanonicalId={setDraftCanonicalId}
          />

          <section className="rounded-lg border border-border/70 bg-card/80 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="font-medium">
                {tRoot('template_manager_title')}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openTemplate(null)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {tRoot('new_template_action')}
              </Button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {templates.map((template) => (
                <Button
                  key={template.id}
                  size="sm"
                  variant={
                    editingTemplateId === template.id ? 'default' : 'outline'
                  }
                  onClick={() => openTemplate(template)}
                >
                  {template.display_name}
                </Button>
              ))}
            </div>
            <TemplateFormEditor
              form={templateForm}
              isEditing={Boolean(editingTemplateId)}
              isPending={saveTemplateMutation.isPending}
              onChange={setTemplateForm}
              onSubmit={() => saveTemplateMutation.mutate()}
              parsedProfile={parsedProfile}
            />
            {getErrorMessage(saveTemplateMutation.error) ? (
              <p className="mt-3 text-destructive text-sm">
                {getErrorMessage(saveTemplateMutation.error)}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
