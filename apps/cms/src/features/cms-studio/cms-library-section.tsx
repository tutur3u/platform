'use client';

import {
  Archive,
  Ellipsis,
  Layers2,
  Plus,
  Settings2,
  Trash2,
} from '@tuturuuu/icons';
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
import { CmsEntriesGallery } from './cms-entries-gallery';
import type { CmsLibrarySectionProps } from './cms-library-section-shared';
import { CmsSettingsSection } from './cms-settings-section';
import { EditModeSkeleton } from './cms-studio-skeletons';
import type { EditSection } from './cms-studio-utils';
import { CmsWorkflowSection } from './cms-workflow-section';
export function CmsLibrarySection({
  activeCollection,
  availableEditSections = ['entries', 'workflow', 'settings'],
  assets,
  binding,
  collections,
  counts,
  editSection,
  entries,
  importPending,
  onChangeEditSection,
  onCreateCollection,
  onCreateEntry,
  onDeleteCollection,
  onDeleteEntry,
  onDuplicateEntry,
  onImport,
  onOpenCollection,
  onOpenEntry,
  onPublishEntry,
  onSearchChange,
  onSelectBulkEntry,
  onSelectCollection,
  onSetWorkflowFilter,
  onSetWorkflowScheduleValue,
  onWorkflowAction,
  publishEvents,
  queryPending,
  scheduleValue,
  search,
  selectedBulkIds,
  selectedEntryId,
  strings,
  workflowEntries,
  workflowFilter,
  workflowLanes,
}: CmsLibrarySectionProps) {
  if (queryPending) {
    return <EditModeSkeleton />;
  }

  const canShowEntries = availableEditSections.includes('entries');
  const canShowWorkflow = availableEditSections.includes('workflow');
  const canShowSettings = availableEditSections.includes('settings');

  return (
    <div className="space-y-4">
      <section
        className={cn(
          'grid gap-3 rounded-[1.35rem] border border-border/70 bg-card/95 p-3',
          editSection === 'entries' && canShowEntries
            ? 'md:grid-cols-[160px_220px_minmax(0,1fr)_auto]'
            : 'md:grid-cols-[160px_minmax(0,1fr)_auto]'
        )}
      >
        <Select
          value={editSection}
          onValueChange={(value) => onChangeEditSection(value as EditSection)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={strings.contentTab} />
          </SelectTrigger>
          <SelectContent>
            {canShowEntries ? (
              <SelectItem value="entries">{strings.contentTab}</SelectItem>
            ) : null}
            {canShowWorkflow ? (
              <SelectItem value="workflow">{strings.workflowTab}</SelectItem>
            ) : null}
            {canShowSettings ? (
              <SelectItem value="settings">{strings.settingsTab}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>

        {editSection === 'entries' && canShowEntries ? (
          <Select
            value={activeCollection?.id ?? ''}
            onValueChange={onSelectCollection}
          >
            <SelectTrigger className="h-9">
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
        ) : null}

        <Input
          className="h-9"
          placeholder={strings.searchPlaceholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={strings.manageCollectionAction}
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onCreateEntry}>
              <Plus className="mr-2 h-4 w-4" />
              {strings.createEntryAction}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateCollection}>
              <Layers2 className="mr-2 h-4 w-4" />
              {strings.createCollectionAction}
            </DropdownMenuItem>
            {canShowWorkflow ? (
              <DropdownMenuItem onClick={() => onChangeEditSection('workflow')}>
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
      </section>

      {editSection === 'entries' && canShowEntries ? (
        <CmsEntriesGallery
          activeCollection={activeCollection}
          assets={assets}
          entries={entries}
          onCreateEntry={onCreateEntry}
          onDeleteEntry={onDeleteEntry}
          onDuplicateEntry={onDuplicateEntry}
          onOpenEntry={onOpenEntry}
          onPublishEntry={onPublishEntry}
          search={search}
          selectedEntryId={selectedEntryId}
          strings={strings}
        />
      ) : null}

      {editSection === 'workflow' && canShowWorkflow ? (
        <CmsWorkflowSection
          onOpenEntry={onOpenEntry}
          onSelectBulkEntry={onSelectBulkEntry}
          onSetWorkflowFilter={onSetWorkflowFilter}
          onSetWorkflowScheduleValue={onSetWorkflowScheduleValue}
          onWorkflowAction={onWorkflowAction}
          scheduleValue={scheduleValue}
          selectedBulkIds={selectedBulkIds}
          strings={strings}
          workflowEntries={workflowEntries}
          workflowFilter={workflowFilter}
          workflowLanes={workflowLanes}
        />
      ) : null}

      {editSection === 'settings' && canShowSettings ? (
        <CmsSettingsSection
          binding={binding}
          collections={collections}
          counts={counts}
          entries={entries}
          importPending={importPending}
          onCreateCollection={onCreateCollection}
          onDeleteCollection={onDeleteCollection}
          onImport={onImport}
          onOpenCollection={onOpenCollection}
          onSelectCollection={onSelectCollection}
          onShowEntries={() => onChangeEditSection('entries')}
          publishEvents={publishEvents}
          strings={strings}
        />
      ) : null}
    </div>
  );
}
