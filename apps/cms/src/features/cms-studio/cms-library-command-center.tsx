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
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import type { CmsLibraryCounts } from './cms-library-section-shared';
import type { CmsStrings } from './cms-strings';
import type { EditSection } from './cms-studio-utils';

type SectionOption = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: EditSection;
};

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
      <div className="font-semibold text-base tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function SectionButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: SectionOption['icon'];
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'ghost'}
      className={cn(
        'h-9 justify-start gap-2 rounded-lg px-3',
        !active && 'border border-border/70 bg-background/60'
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Button>
  );
}

export function CmsLibraryCommandCenter({
  activeCollection,
  availableEditSections,
  collections,
  counts,
  createEntryPending,
  editSection,
  importPending,
  onChangeEditSection,
  onCreateCollection,
  onCreateEntry,
  onDeleteCollection,
  onImport,
  onOpenCollection,
  onSearchChange,
  onSelectCollection,
  search,
  strings,
}: {
  activeCollection: ExternalProjectCollection | null;
  availableEditSections: EditSection[];
  collections: ExternalProjectCollection[];
  counts: CmsLibraryCounts;
  createEntryPending?: boolean;
  editSection: EditSection;
  importPending: boolean;
  onChangeEditSection: (section: EditSection) => void;
  onCreateCollection: () => void;
  onCreateEntry: () => void;
  onDeleteCollection: (collectionId: string) => void;
  onImport: () => void;
  onOpenCollection: (collectionId: string) => void;
  onSearchChange: (value: string) => void;
  onSelectCollection: (collectionId: string) => void;
  search: string;
  strings: CmsStrings;
}) {
  const sectionOptions = (
    [
      {
        icon: Layers2,
        label: strings.contentTab,
        value: 'entries',
      },
      {
        icon: Database,
        label: strings.contentModelTab,
        value: 'content-model',
      },
      {
        icon: Archive,
        label: strings.workflowTab,
        value: 'workflow',
      },
      {
        icon: Settings2,
        label: strings.settingsTab,
        value: 'settings',
      },
    ] satisfies SectionOption[]
  ).filter((option) => availableEditSections.includes(option.value));
  const canShowContentModel = availableEditSections.includes('content-model');
  const canShowWorkflow = availableEditSections.includes('workflow');
  const showEntryTools = editSection === 'entries';

  return (
    <section className="space-y-4 rounded-lg border border-border/70 bg-card/95 p-3 shadow-none sm:p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="font-semibold text-lg">
              {strings.libraryCommandCenterTitle}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {strings.libraryCommandCenterDescription}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {sectionOptions.map((option) => (
              <SectionButton
                key={option.value}
                active={editSection === option.value}
                icon={option.icon}
                label={option.label}
                onClick={() => onChangeEditSection(option.value)}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[460px]">
          <MetricPill
            label={strings.entriesMetricLabel}
            value={counts.entries}
          />
          <MetricPill
            label={strings.collectionsMetricLabel}
            value={counts.collections}
          />
          <MetricPill label={strings.statusDraft} value={counts.drafts} />
          <MetricPill
            label={strings.statusPublished}
            value={counts.published}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {showEntryTools ? (
          <Select
            disabled={collections.length === 0}
            value={activeCollection?.id ?? ''}
            onValueChange={onSelectCollection}
          >
            <SelectTrigger className="h-10 lg:w-[240px]">
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
        ) : (
          <Badge
            variant="outline"
            className="h-10 justify-start rounded-lg px-3 font-normal lg:w-[240px]"
          >
            {activeCollection?.title ?? strings.collectionFallbackLabel}
          </Badge>
        )}

        {showEntryTools ? (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              placeholder={strings.searchPlaceholder}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-muted-foreground text-sm">
            {strings.libraryCommandCenterContext}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            className="h-10"
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
    </section>
  );
}
