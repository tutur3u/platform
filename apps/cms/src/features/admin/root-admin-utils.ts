import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
  WorkspaceExternalProjectBindingAudit,
} from '@tuturuuu/types';

export type ProjectStatusFilter = 'all' | 'connected' | 'unconnected';
export type ProjectViewMode = 'grid' | 'list';

export function formatAdminToken(value: string) {
  return value
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function formatAdminTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export function getWorkspaceLabel(
  workspace: Pick<ExternalProjectWorkspaceBindingSummary, 'name'>,
  unnamedLabel: string
) {
  return workspace.name || unnamedLabel;
}

export function getProjectTemplateLabel(
  workspace: ExternalProjectWorkspaceBindingSummary,
  unboundLabel: string
) {
  return (
    workspace.binding.canonical_project?.display_name ??
    workspace.binding.canonical_id ??
    unboundLabel
  );
}

export function getProjectAdapterLabel(
  workspace: ExternalProjectWorkspaceBindingSummary,
  unboundLabel: string
) {
  return workspace.binding.adapter
    ? formatAdminToken(workspace.binding.adapter)
    : unboundLabel;
}

export function workspaceMatchesQuery(
  workspace: ExternalProjectWorkspaceBindingSummary,
  query: string
) {
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
}

export function workspaceMatchesStatus(
  workspace: ExternalProjectWorkspaceBindingSummary,
  status: ProjectStatusFilter
) {
  if (status === 'connected') return workspace.binding.enabled;
  if (status === 'unconnected') return !workspace.binding.enabled;
  return true;
}

export function workspaceMatchesAdapter(
  workspace: ExternalProjectWorkspaceBindingSummary,
  adapter: string
) {
  return adapter === 'all' || workspace.binding.adapter === adapter;
}

export function getAuditsForWorkspace(
  audits: WorkspaceExternalProjectBindingAudit[],
  workspaceId: string
) {
  return audits.filter((audit) => audit.destination_ws_id === workspaceId);
}

export function sortProjectsByConnection(
  projects: ExternalProjectWorkspaceBindingSummary[]
) {
  return [...projects].sort((first, second) => {
    if (first.binding.enabled !== second.binding.enabled) {
      return first.binding.enabled ? -1 : 1;
    }

    return (first.name ?? first.id).localeCompare(second.name ?? second.id);
  });
}

export function getActiveTemplates(projects: CanonicalExternalProject[]) {
  return projects.filter((project) => project.is_active);
}
