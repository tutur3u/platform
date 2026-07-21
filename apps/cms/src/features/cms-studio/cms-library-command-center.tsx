'use client';

import {
  Archive,
  Database,
  Ellipsis,
  FolderSync,
  Layers2,
  Plus,
  Search,
  Settings2,
  Trash2,
} from '@tuturuuu/icons';
import type { ExternalProjectCollection } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import type { CmsLibraryCounts } from './cms-library-section-shared';
import type { CmsStrings } from './cms-strings';
import type { EditSection, WorkflowFilter } from './cms-studio-utils';

type SectionOption = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: EditSection;
};

function MetricPill({
  active,
  label,
  onClick,
  value,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  value: number;
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-lg border px-3 py-2 text-left transition-colors',
        active
          ? 'border-foreground/25 bg-foreground text-background'
          : 'border-border/70 bg-background/70 hover:border-foreground/20 hover:bg-background'
      )}
      onClick={onClick}
    >
      <div className="font-semibold text-base tabular-nums">{value}</div>
      <div
        className={cn(
          'text-xs',
          active ? 'text-background/70' : 'text-muted-foreground'
        )}
      >
        {label}
      </div>
    </button>
  );
}

export function CmsLibraryCommandCenter({
  activeCollection,
  availableEditSections,
  collections,
  counts,
  createEntryPending,
  editSection,
  entryFilter,
  importPending,
  onChangeEditSection,
  onCreateCollection,
  onCreateEntry,
  onDeleteCollection,
  onImport,
  onOpenCollection,
  onSearchChange,
  onSelectCollection,
  onSetEntryFilter,
  search,
  strings,
}: {
  activeCollection: ExternalProjectCollection | null;
  availableEditSections: EditSection[];
  collections: ExternalProjectCollection[];
  counts: CmsLibraryCounts;
  createEntryPending?: boolean;
  editSection: EditSection;
  entryFilter: WorkflowFilter;
  importPending: boolean;
  onChangeEditSection: (section: EditSection) => void;
  onCreateCollection: () => void;
  onCreateEntry: () => void;
  onDeleteCollection: (collectionId: string) => void;
  onImport: () => void;
  onOpenCollection: (collectionId: string) => void;
  onSearchChange: (value: string) => void;
  onSelectCollection: (collectionId: string) => void;
  onSetEntryFilter: (filter: WorkflowFilter) => void;
  search: string;
  strings: CmsStrings;
}) {
  const sectionOptions = (
    [
      { icon: Layers2, label: strings.contentTab, value: 'entries' },
      {
        icon: Database,
        label: strings.contentModelTab,
        value: 'content-model',
      },
      { icon: Archive, label: strings.workflowTab, value: 'workflow' },
      { icon: Settings2, label: strings.settingsTab, value: 'settings' },
    ] satisfies SectionOption[]
  ).filter((option) => availableEditSections.includes(option.value));
  const canShowContentModel = availableEditSections.includes('content-model');
  const canShowWorkflow = availableEditSections.includes('workflow');
  const showEntryTools = editSection === 'entries';
  const statusOptions: Array<{ label: string; value: WorkflowFilter }> = [
    { label: strings.filterAll, value: 'all' },
    { label: strings.statusDraft, value: 'draft' },
    { label: strings.statusScheduled, value: 'scheduled' },
    { label: strings.statusPublished, value: 'published' },
    { label: strings.statusArchived, value: 'archived' },
  ];
  const metrics: Array<{
    count: number;
    label: string;
    value: WorkflowFilter;
  }> = [
    {
      count: counts.entries,
      label: strings.entriesMetricLabel,
      value: 'all',
    },
    { count: counts.drafts, label: strings.statusDraft, value: 'draft' },
    {
      count: counts.scheduled,
      label: strings.statusScheduled,
      value: 'scheduled',
    },
    {
      count: counts.published,
      label: strings.statusPublished,
      value: 'published',
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-none">
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <div className="min-w-0 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-xl tracking-tight">
                {strings.libraryCommandCenterTitle}
              </h2>
              <Badge variant="secondary" className="rounded-md font-normal">
                {counts.collections} {strings.collectionsLabel}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">
              {strings.libraryCommandCenterDescription}
            </p>
          </div>

          <Tabs
            value={editSection}
            onValueChange={(value) => {
              const nextSection = sectionOptions.find(
                (option) => option.value === value
              );
              if (nextSection) onChangeEditSection(nextSection.value);
            }}
          >
            <TabsList className="h-auto max-w-full justify-start gap-1 overflow-x-auto rounded-lg p-1">
              {sectionOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <TabsTrigger
                    key={option.value}
                    value={option.value}
                    className="h-9 gap-2 rounded-md px-3"
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
          {metrics.map((metric) => (
            <MetricPill
              key={metric.value}
              active={showEntryTools && entryFilter === metric.value}
              label={metric.label}
              value={metric.count}
              onClick={() => {
                onChangeEditSection('entries');
                onSetEntryFilter(metric.value);
              }}
            />
          ))}
        </div>
      </div>

      <div className="border-border/70 border-t bg-background/35 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {showEntryTools ? (
            <>
              <Select
                disabled={collections.length === 0}
                value={activeCollection?.id ?? ''}
                onValueChange={onSelectCollection}
              >
                <SelectTrigger
                  className="h-10 lg:w-[240px]"
                  aria-label={strings.collectionsMetricLabel}
                >
                  <SelectValue placeholder={strings.emptyCollection} />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((collection) => (
                    <SelectItem key={collection.id} value={collection.id}>
                      {collection.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={entryFilter}
                onValueChange={(value) =>
                  onSetEntryFilter(value as WorkflowFilter)
                }
              >
                <SelectTrigger
                  className="h-10 lg:w-[170px]"
                  aria-label={strings.statusLabel}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 pl-9"
                  placeholder={strings.searchPlaceholder}
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-muted-foreground text-sm">
              {strings.libraryCommandCenterContext}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              className="h-10 flex-1 lg:flex-none"
              disabled={createEntryPending}
              onClick={onCreateEntry}
            >
              <Plus className="mr-2 h-4 w-4" />
              {strings.createEntryAction}
            </Button>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10"
                  aria-label={strings.manageCollectionAction}
                >
                  <Ellipsis className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={onCreateCollection}>
                  <Layers2 className="mr-2 h-4 w-4" />
                  {strings.createCollectionAction}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={importPending} onClick={onImport}>
                  <FolderSync className="mr-2 h-4 w-4" />
                  {strings.importAction}
                </DropdownMenuItem>
                {canShowContentModel ? (
                  <DropdownMenuItem
                    onClick={() => onChangeEditSection('content-model')}
                  >
                    <Database className="mr-2 h-4 w-4" />
                    {strings.contentModelTab}
                  </DropdownMenuItem>
                ) : null}
                {canShowWorkflow ? (
                  <DropdownMenuItem
                    onClick={() => onChangeEditSection('workflow')}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    {strings.workflowTab}
                  </DropdownMenuItem>
                ) : null}
                {activeCollection ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onOpenCollection(activeCollection.id)}
                    >
                      <Settings2 className="mr-2 h-4 w-4" />
                      {strings.editCollectionAction}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDeleteCollection(activeCollection.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {strings.deleteCollectionAction}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </section>
  );
}
