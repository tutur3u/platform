'use client';

import {
  ArrowRight,
  Clock,
  LayoutGrid,
  Link,
  List,
  Search,
  SlidersHorizontal,
  Unlink,
} from '@tuturuuu/icons';
import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { cn } from '@tuturuuu/utils/format';
import {
  formatAdminTime,
  formatAdminToken,
  getProjectAdapterLabel,
  getProjectTemplateLabel,
  getWorkspaceLabel,
  type ProjectStatusFilter,
  type ProjectViewMode,
} from './root-admin-utils';

type ProjectListProps = {
  adapterFilter: string;
  onAdapterFilterChange: (value: string) => void;
  onOpenProject: (workspaceId: string) => void;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: ProjectStatusFilter) => void;
  onViewModeChange: (value: ProjectViewMode) => void;
  projects: ExternalProjectWorkspaceBindingSummary[];
  query: string;
  statusFilter: ProjectStatusFilter;
  strings: ProjectListStrings;
  templates: CanonicalExternalProject[];
  viewMode: ProjectViewMode;
};

export type ProjectListStrings = {
  allSiteTypes: string;
  allStatus: string;
  connectedStatus: string;
  emptyDescription: string;
  emptyTitle: string;
  gridView: string;
  internalIdLabel: string;
  lastChangedLabel: string;
  listView: string;
  openProjectAction: string;
  personalLabel: string;
  projectCountLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  siteTypeLabel: string;
  statusLabel: string;
  templateLabel: string;
  unboundLabel: string;
  unconnectedStatus: string;
  unnamedWorkspace: string;
};

export function RootAdminProjects({
  adapterFilter,
  onAdapterFilterChange,
  onOpenProject,
  onQueryChange,
  onStatusFilterChange,
  onViewModeChange,
  projects,
  query,
  statusFilter,
  strings,
  templates,
  viewMode,
}: ProjectListProps) {
  const adapterOptions = Array.from(
    new Set(templates.map((template) => template.adapter))
  );

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-border/70 bg-card/90 p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
          <div className="grid gap-2">
            <Label htmlFor="cms-project-search">{strings.searchLabel}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cms-project-search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={strings.searchPlaceholder}
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{strings.statusLabel}</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                onStatusFilterChange(value as ProjectStatusFilter)
              }
            >
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{strings.allStatus}</SelectItem>
                <SelectItem value="connected">
                  {strings.connectedStatus}
                </SelectItem>
                <SelectItem value="unconnected">
                  {strings.unconnectedStatus}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{strings.siteTypeLabel}</Label>
            <Select value={adapterFilter} onValueChange={onAdapterFilterChange}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{strings.allSiteTypes}</SelectItem>
                {adapterOptions.map((adapter) => (
                  <SelectItem key={adapter} value={adapter}>
                    {formatAdminToken(adapter)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{strings.projectCountLabel}</Label>
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) =>
                value && onViewModeChange(value as ProjectViewMode)
              }
              className="rounded-md border border-border/70 bg-background p-1"
            >
              <ToggleGroupItem value="grid" aria-label={strings.gridView}>
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label={strings.listView}>
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          {projects.length} {strings.projectCountLabel}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-border/70 border-dashed bg-background/60 px-4 py-12 text-center">
          <div className="font-medium">{strings.emptyTitle}</div>
          <div className="mx-auto mt-2 max-w-xl text-muted-foreground text-sm leading-6">
            {strings.emptyDescription}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'
              : 'space-y-3'
          )}
        >
          {projects.map((project) => (
            <ProjectTile
              key={project.id}
              mode={viewMode}
              onOpen={() => onOpenProject(project.id)}
              project={project}
              strings={strings}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectTile({
  mode,
  onOpen,
  project,
  strings,
}: {
  mode: ProjectViewMode;
  onOpen: () => void;
  project: ExternalProjectWorkspaceBindingSummary;
  strings: ProjectListStrings;
}) {
  const connected = project.binding.enabled;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group w-full rounded-lg border border-border/70 bg-card/85 p-4 text-left transition-colors hover:border-foreground/25 hover:bg-card',
        mode === 'list' &&
          'grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] md:items-center'
      )}
    >
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={connected ? 'default' : 'outline'}
            className="rounded-md"
          >
            {connected ? (
              <Link className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Unlink className="mr-1 h-3.5 w-3.5" />
            )}
            {connected ? strings.connectedStatus : strings.unconnectedStatus}
          </Badge>
          {project.personal ? (
            <Badge variant="secondary" className="rounded-md">
              {strings.personalLabel}
            </Badge>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="truncate font-semibold text-lg">
            {getWorkspaceLabel(project, strings.unnamedWorkspace)}
          </div>
          <div className="mt-1 truncate text-muted-foreground text-sm">
            {strings.internalIdLabel}: {project.id}
          </div>
        </div>
      </div>

      <div className="mt-4 min-w-0 space-y-2 md:mt-0">
        <div className="truncate text-sm">
          <span className="text-muted-foreground">{strings.templateLabel}</span>{' '}
          {getProjectTemplateLabel(project, strings.unboundLabel)}
        </div>
        <div className="truncate text-muted-foreground text-sm">
          {strings.siteTypeLabel}:{' '}
          {getProjectAdapterLabel(project, strings.unboundLabel)}
        </div>
        <div className="inline-flex items-center gap-2 text-muted-foreground text-xs">
          <Clock className="h-3.5 w-3.5" />
          {strings.lastChangedLabel}: {formatAdminTime(project.last_changed_at)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-muted-foreground text-sm md:mt-0 md:justify-end">
        <span>{strings.openProjectAction}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
