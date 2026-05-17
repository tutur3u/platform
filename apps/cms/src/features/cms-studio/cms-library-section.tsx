'use client';

import { CmsContentModelSection } from './cms-content-model-section';
import { CmsEntriesGallery } from './cms-entries-gallery';
import { CmsLibraryCommandCenter } from './cms-library-command-center';
import type { CmsLibrarySectionProps } from './cms-library-section-shared';
import { CmsSettingsSection } from './cms-settings-section';
import { EditModeSkeleton } from './cms-studio-skeletons';
import { CmsWorkflowSection } from './cms-workflow-section';

export function CmsLibrarySection({
  activeCollection,
  availableEditSections = ['entries', 'content-model', 'workflow', 'settings'],
  assets,
  binding,
  collections,
  counts,
  createEntryHint,
  createEntryPending,
  deleteFieldDefinitionPending,
  editSection,
  entries,
  fieldDefinitions,
  importPending,
  onApplyContentModelTemplate,
  onChangeEditSection,
  onCreateCollection,
  onCreateEntry,
  onDeleteCollection,
  onDeleteEntry,
  onDeleteFieldDefinition,
  onDuplicateEntry,
  onImport,
  onOpenCollection,
  onOpenEntry,
  onOpenQuickTaxonomy,
  onPublishEntry,
  onSearchChange,
  onSelectBulkEntry,
  onSelectCollection,
  onSetWorkflowFilter,
  onSetWorkflowScheduleValue,
  onWorkflowAction,
  publishEvents,
  queryPending,
  quickTaxonomyPending,
  scheduleValue,
  search,
  selectedBulkIds,
  selectedEntryId,
  strings,
  taxonomyAvailable,
  templatePending,
  workflowEntries,
  workflowFilter,
  workflowLanes,
}: CmsLibrarySectionProps) {
  if (queryPending) {
    return <EditModeSkeleton />;
  }

  const canShowEntries = availableEditSections.includes('entries');
  const canShowContentModel = availableEditSections.includes('content-model');
  const canShowWorkflow = availableEditSections.includes('workflow');
  const canShowSettings = availableEditSections.includes('settings');

  return (
    <div className="space-y-4">
      <CmsLibraryCommandCenter
        activeCollection={activeCollection}
        availableEditSections={availableEditSections}
        collections={collections}
        counts={counts}
        createEntryPending={createEntryPending}
        editSection={editSection}
        fieldDefinitions={fieldDefinitions}
        importPending={importPending}
        onChangeEditSection={onChangeEditSection}
        onCreateCollection={onCreateCollection}
        onCreateEntry={onCreateEntry}
        onDeleteCollection={onDeleteCollection}
        onImport={onImport}
        onOpenCollection={onOpenCollection}
        onSearchChange={onSearchChange}
        onSelectCollection={onSelectCollection}
        search={search}
        strings={strings}
      />

      {editSection === 'entries' && canShowEntries ? (
        <CmsEntriesGallery
          activeCollection={activeCollection}
          assets={assets}
          createEntryHint={createEntryHint}
          createEntryPending={createEntryPending}
          entries={entries}
          onCreateEntry={onCreateEntry}
          onDeleteEntry={onDeleteEntry}
          onDuplicateEntry={onDuplicateEntry}
          onOpenEntry={onOpenEntry}
          onOpenQuickTaxonomy={onOpenQuickTaxonomy}
          onPublishEntry={onPublishEntry}
          quickTaxonomyPending={quickTaxonomyPending}
          search={search}
          selectedEntryId={selectedEntryId}
          taxonomyAvailable={taxonomyAvailable}
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

      {editSection === 'content-model' && canShowContentModel ? (
        <CmsContentModelSection
          collections={collections}
          deleteFieldDefinitionPending={deleteFieldDefinitionPending}
          fieldDefinitions={fieldDefinitions}
          onApplyTemplate={onApplyContentModelTemplate}
          onDeleteFieldDefinition={onDeleteFieldDefinition}
          strings={strings}
          templatePending={templatePending}
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
