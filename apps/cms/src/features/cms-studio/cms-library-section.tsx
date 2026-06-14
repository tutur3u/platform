'use client';

import { FolderSync, Layers2, Plus, Settings2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
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
  surface = 'library',
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
  const activeCollectionEntryCount = activeCollection
    ? entries.filter((entry) => entry.collection_id === activeCollection.id)
        .length
    : entries.length;
  const activeCollectionPublishedCount = activeCollection
    ? entries.filter(
        (entry) =>
          entry.collection_id === activeCollection.id &&
          entry.status === 'published'
      ).length
    : entries.filter((entry) => entry.status === 'published').length;
  const entriesWithMedia = new Set(
    assets
      .map((asset) => asset.entry_id)
      .filter((entryId): entryId is string => Boolean(entryId))
  );
  const missingVisualCount = entries.filter(
    (entry) => !entriesWithMedia.has(entry.id)
  ).length;
  const activeContent =
    editSection === 'entries' && canShowEntries ? (
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
    ) : editSection === 'workflow' && canShowWorkflow ? (
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
    ) : editSection === 'content-model' && canShowContentModel ? (
      <CmsContentModelSection
        collections={collections}
        deleteFieldDefinitionPending={deleteFieldDefinitionPending}
        fieldDefinitions={fieldDefinitions}
        onApplyTemplate={onApplyContentModelTemplate}
        onDeleteFieldDefinition={onDeleteFieldDefinition}
        strings={strings}
        templatePending={templatePending}
      />
    ) : editSection === 'settings' && canShowSettings ? (
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
    ) : null;

  if (surface === 'landing') {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-border/70 bg-card/80 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="font-semibold text-xl">
                {strings.landingBuilderTitle}
              </h2>
              <p className="mt-1 text-muted-foreground text-sm leading-6">
                {strings.landingBuilderDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={onImport}
                disabled={importPending}
              >
                <FolderSync className="mr-2 h-4 w-4" />
                {strings.importAction}
              </Button>
              <Button onClick={onCreateEntry} disabled={createEntryPending}>
                <Plus className="mr-2 h-4 w-4" />
                {strings.createEntryAction}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border/70 bg-background/70 p-3">
              <div className="text-muted-foreground text-xs">
                {strings.landingReadySections}
              </div>
              <div className="mt-1 font-semibold text-2xl tabular-nums">
                {counts.published}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-background/70 p-3">
              <div className="text-muted-foreground text-xs">
                {strings.landingDraftSections}
              </div>
              <div className="mt-1 font-semibold text-2xl tabular-nums">
                {counts.drafts + counts.scheduled}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-background/70 p-3">
              <div className="text-muted-foreground text-xs">
                {strings.landingMissingVisuals}
              </div>
              <div className="mt-1 font-semibold text-2xl tabular-nums">
                {missingVisualCount}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <section className="rounded-lg border border-border/70 bg-card/80">
              <div className="flex items-center justify-between gap-3 border-border/70 border-b px-3 py-3">
                <div>
                  <h2 className="font-medium text-sm">
                    {strings.landingSectionsTitle}
                  </h2>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {collections.length} {strings.collectionsLabel}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8 rounded-md"
                  onClick={onCreateCollection}
                >
                  <Layers2 className="h-4 w-4" />
                  <span className="sr-only">
                    {strings.createCollectionAction}
                  </span>
                </Button>
              </div>

              <div className="max-h-[52rem] overflow-auto p-2">
                {collections.map((collection) => {
                  const entryCount = entries.filter(
                    (entry) => entry.collection_id === collection.id
                  ).length;

                  return (
                    <button
                      key={collection.id}
                      type="button"
                      className={cn(
                        'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        activeCollection?.id === collection.id
                          ? 'border-foreground/25 bg-foreground text-background'
                          : 'border-transparent hover:border-border/70 hover:bg-background/80'
                      )}
                      onClick={() => onSelectCollection(collection.id)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {collection.title}
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 block truncate text-xs',
                            activeCollection?.id === collection.id
                              ? 'text-background/70'
                              : 'text-muted-foreground'
                          )}
                        >
                          {entryCount} {strings.entriesMetricLabel}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-sm border border-current/20 px-1.5 py-0.5 text-xs">
                        {strings.editEntryAction}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-border/70 bg-card/80 p-3">
              <h2 className="font-medium text-sm">
                {strings.landingReadinessTitle}
              </h2>
              <div className="mt-3 grid gap-2">
                <Button
                  variant={editSection === 'entries' ? 'default' : 'outline'}
                  onClick={() => onChangeEditSection('entries')}
                >
                  {strings.contentTab}
                </Button>
                {canShowWorkflow ? (
                  <Button
                    variant={editSection === 'workflow' ? 'default' : 'outline'}
                    onClick={() => onChangeEditSection('workflow')}
                  >
                    {strings.workflowTab}
                  </Button>
                ) : null}
              </div>
            </section>
          </aside>

          <main className="min-w-0">
            <div className="rounded-lg border border-border/70 bg-background/35 p-3">
              {activeContent}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CmsLibraryCommandCenter
        activeCollection={activeCollection}
        availableEditSections={availableEditSections}
        collections={collections}
        counts={counts}
        createEntryPending={createEntryPending}
        editSection={editSection}
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

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <section className="rounded-lg border border-border/70 bg-card/80">
            <div className="flex items-center justify-between gap-3 border-border/70 border-b px-3 py-3">
              <div>
                <h2 className="font-medium text-sm">
                  {strings.collectionsMetricLabel}
                </h2>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {collections.length} {strings.collectionsLabel}
                </p>
              </div>
              <Button
                size="icon"
                variant="outline"
                className="size-8 rounded-md"
                onClick={onCreateCollection}
              >
                <Layers2 className="h-4 w-4" />
                <span className="sr-only">
                  {strings.createCollectionAction}
                </span>
              </Button>
            </div>

            <div className="max-h-[52rem] overflow-auto p-2">
              {collections.map((collection) => {
                const entryCount = entries.filter(
                  (entry) => entry.collection_id === collection.id
                ).length;

                return (
                  <button
                    key={collection.id}
                    type="button"
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      activeCollection?.id === collection.id
                        ? 'border-foreground/25 bg-foreground text-background'
                        : 'border-transparent hover:border-border/70 hover:bg-background/80'
                    )}
                    onClick={() => onSelectCollection(collection.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {collection.title}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block truncate text-xs',
                          activeCollection?.id === collection.id
                            ? 'text-background/70'
                            : 'text-muted-foreground'
                        )}
                      >
                        {strings.slugLabel}: {collection.slug}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-sm border border-current/20 px-1.5 py-0.5 text-xs tabular-nums">
                      {entryCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border/70 bg-card/80 p-3">
            <div>
              <h2 className="font-medium text-sm">{strings.settingsTab}</h2>
              <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                {activeCollection?.title ?? strings.collectionFallbackLabel}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/70 bg-background/70 px-3 py-2">
                <div className="font-semibold tabular-nums">
                  {activeCollectionEntryCount}
                </div>
                <div className="text-muted-foreground text-xs">
                  {strings.entriesMetricLabel}
                </div>
              </div>
              <div className="rounded-md border border-border/70 bg-background/70 px-3 py-2">
                <div className="font-semibold tabular-nums">
                  {activeCollectionPublishedCount}
                </div>
                <div className="text-muted-foreground text-xs">
                  {strings.statusPublished}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              <Button onClick={onCreateEntry}>
                <Plus className="mr-2 h-4 w-4" />
                {strings.createEntryAction}
              </Button>
              {activeCollection ? (
                <Button
                  variant="outline"
                  onClick={() => onOpenCollection(activeCollection.id)}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {strings.editCollectionAction}
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={importPending}
                onClick={onImport}
              >
                <FolderSync className="mr-2 h-4 w-4" />
                {strings.importAction}
              </Button>
            </div>
          </section>
        </aside>

        <main className="min-w-0">
          <div className="rounded-lg border border-border/70 bg-background/35 p-3">
            {activeContent}
          </div>
        </main>
      </div>
    </div>
  );
}
