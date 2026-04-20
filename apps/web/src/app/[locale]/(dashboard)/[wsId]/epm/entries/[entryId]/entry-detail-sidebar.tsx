'use client';

import type {
  ExternalProjectEntry,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { EpmStrings } from '../../epm-strings';
import { EntryDetailFeaturedEntryCard } from './entry-detail-featured-entry-card';
import { EntryDetailFeaturedPlacementCard } from './entry-detail-featured-placement-card';
import {
  type EntryFormState,
  type FeaturedEntryEditorConfig,
  type FeaturedPlacementConfig,
  formatDateLabel,
  formatStatus,
} from './entry-detail-shared';
import { EntryDetailTaxonomyCard } from './entry-detail-taxonomy-card';

type EntryDetailSidebarProps = {
  activeCollectionDescription: string | null | undefined;
  activeCollectionSlug: string | null | undefined;
  activeCollectionTitle: string;
  activeEntry: ExternalProjectEntry;
  artworkOptions: ExternalProjectEntry[];
  binding: WorkspaceExternalProjectBinding;
  categoryCreateOpen: boolean;
  categoryDraft: string;
  categoryOptions: ComboboxOption[];
  configuredCategoryOptions: string[];
  configuredTagOptions: string[];
  createFeaturedPlacementConfigPending: boolean;
  entryForm: EntryFormState;
  featuredEntryConfig: FeaturedEntryEditorConfig | null;
  featuredEntrySlugs: string[];
  featuredPlacementActive: boolean;
  featuredPlacementConfig: FeaturedPlacementConfig | null;
  featuredPlacementIndex: number;
  featuredPlacementProcessing: boolean;
  featuredPlacementSlugsLength: number;
  isTaxonomyConfigEditor: boolean;
  onAddTags: (value: string) => void;
  onApplyCategory: (value: string) => void;
  onCategoryCreateOpenChange: (open: boolean) => void;
  onCategoryDraftChange: (value: string) => void;
  onCategorySelectionChange: (value: string | string[]) => void;
  onClearCategories: () => void;
  onClearTags: () => void;
  onCreateFeaturedPlacementConfig: () => void;
  onFeaturedEntryMove: (slug: string, direction: -1 | 1) => void;
  onFeaturedEntryToggle: (slug: string) => void;
  onFeaturedPlacementMove: (direction: -1 | 1) => void;
  onFeaturedPlacementToggle: () => void;
  onPairedArtworkChange: (value: string) => void;
  onRemoveCategory: (category: string) => void;
  onRemoveTag: (tag: string) => void;
  onScheduledForChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onStatusChange: (status: ExternalProjectEntry['status']) => void;
  onTagCreateOpenChange: (open: boolean) => void;
  onTagDraftChange: (value: string) => void;
  onTagSelectionChange: (value: string[]) => void;
  onTitleChange: (value: string) => void;
  pairedArtworkSlug: string;
  strings: EpmStrings;
  supportsPairedVisual: boolean;
  tagCreateOpen: boolean;
  tagDraft: string;
  tagOptions: ComboboxOption[];
};

export function EntryDetailSidebar({
  activeCollectionDescription,
  activeCollectionSlug,
  activeCollectionTitle,
  activeEntry,
  artworkOptions,
  binding,
  categoryCreateOpen,
  categoryDraft,
  categoryOptions,
  configuredCategoryOptions,
  configuredTagOptions,
  createFeaturedPlacementConfigPending,
  entryForm,
  featuredEntryConfig,
  featuredEntrySlugs,
  featuredPlacementActive,
  featuredPlacementConfig,
  featuredPlacementIndex,
  featuredPlacementProcessing,
  featuredPlacementSlugsLength,
  isTaxonomyConfigEditor,
  onAddTags,
  onApplyCategory,
  onCategoryCreateOpenChange,
  onCategoryDraftChange,
  onCategorySelectionChange,
  onClearCategories,
  onClearTags,
  onCreateFeaturedPlacementConfig,
  onFeaturedEntryMove,
  onFeaturedEntryToggle,
  onFeaturedPlacementMove,
  onFeaturedPlacementToggle,
  onPairedArtworkChange,
  onRemoveCategory,
  onRemoveTag,
  onScheduledForChange,
  onSlugChange,
  onStatusChange,
  onTagCreateOpenChange,
  onTagDraftChange,
  onTagSelectionChange,
  onTitleChange,
  pairedArtworkSlug,
  strings,
  supportsPairedVisual,
  tagCreateOpen,
  tagDraft,
  tagOptions,
}: EntryDetailSidebarProps) {
  return (
    <div className="space-y-5 xl:sticky xl:top-28 xl:self-start">
      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardHeader>
          <CardTitle>{strings.detailsTitle}</CardTitle>
          <CardDescription>{strings.editEntryDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="entry-title">{strings.titleLabel}</Label>
            <Input
              id="entry-title"
              className="h-11"
              value={entryForm.title}
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </div>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry-slug">{strings.slugLabel}</Label>
              <Input
                id="entry-slug"
                value={entryForm.slug}
                onChange={(event) => onSlugChange(event.target.value)}
              />
            </div>
            {supportsPairedVisual ? (
              <div className="space-y-2">
                <Label htmlFor="entry-paired-artwork">Paired visual</Label>
                <Select
                  value={pairedArtworkSlug}
                  onValueChange={onPairedArtworkChange}
                >
                  <SelectTrigger id="entry-paired-artwork">
                    <SelectValue placeholder="No paired visual" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No paired visual</SelectItem>
                    {artworkOptions.map((artworkEntry) => (
                      <SelectItem
                        key={artworkEntry.id}
                        value={artworkEntry.slug}
                      >
                        {artworkEntry.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <EntryDetailTaxonomyCard
              categoryCreateOpen={categoryCreateOpen}
              categoryDraft={categoryDraft}
              categoryOptions={categoryOptions}
              configuredCategoryOptions={configuredCategoryOptions}
              configuredTagOptions={configuredTagOptions}
              isTaxonomyConfigEditor={isTaxonomyConfigEditor}
              onAddTags={onAddTags}
              onApplyCategory={onApplyCategory}
              onCategoryCreateOpenChange={onCategoryCreateOpenChange}
              onCategoryDraftChange={onCategoryDraftChange}
              onCategorySelectionChange={onCategorySelectionChange}
              onClearCategories={onClearCategories}
              onClearTags={onClearTags}
              onRemoveCategory={onRemoveCategory}
              onRemoveTag={onRemoveTag}
              onTagCreateOpenChange={onTagCreateOpenChange}
              onTagDraftChange={onTagDraftChange}
              onTagSelectionChange={onTagSelectionChange}
              selectedCategory={entryForm.category}
              selectedTags={entryForm.tags}
              strings={strings}
              tagCreateOpen={tagCreateOpen}
              tagDraft={tagDraft}
              tagOptions={tagOptions}
            />

            {featuredEntryConfig ? (
              <EntryDetailFeaturedEntryCard
                config={featuredEntryConfig}
                featuredEntrySlugs={featuredEntrySlugs}
                onMove={onFeaturedEntryMove}
                onToggle={onFeaturedEntryToggle}
                strings={strings}
              />
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="entry-status">{strings.statusLabel}</Label>
              <Select
                value={entryForm.status}
                onValueChange={(value) =>
                  onStatusChange(value as ExternalProjectEntry['status'])
                }
              >
                <SelectTrigger id="entry-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{strings.statusDraft}</SelectItem>
                  <SelectItem value="scheduled">
                    {strings.statusScheduled}
                  </SelectItem>
                  <SelectItem value="published">
                    {strings.statusPublished}
                  </SelectItem>
                  <SelectItem value="archived">
                    {strings.statusArchived}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-scheduled-for">
                {strings.scheduledForLabel}
              </Label>
              <Input
                id="entry-scheduled-for"
                type="datetime-local"
                value={entryForm.scheduledFor}
                onChange={(event) => onScheduledForChange(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardHeader>
          <CardTitle>{strings.workspaceStatusTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3">
            <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
              <div className="text-muted-foreground text-xs">
                {strings.collectionsLabel}
              </div>
              <div className="mt-2 font-medium text-lg">
                {activeCollectionTitle}
              </div>
              <div className="mt-2 text-muted-foreground text-sm">
                {activeCollectionDescription || activeCollectionSlug}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
                <div className="text-muted-foreground text-xs">
                  {strings.statusLabel}
                </div>
                <div className="mt-2 font-medium">
                  {formatStatus(activeEntry.status, strings)}
                </div>
              </div>
              <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
                <div className="text-muted-foreground text-xs">
                  {strings.scheduledForLabel}
                </div>
                <div className="mt-2 font-medium">
                  {formatDateLabel(activeEntry.scheduled_for, strings)}
                </div>
              </div>
            </div>
            <div className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4">
              <div className="text-muted-foreground text-xs">
                {strings.workspaceBindingLabel}
              </div>
              <div className="mt-2 font-medium">
                {binding.canonical_project?.display_name ??
                  strings.unboundLabel}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {featuredPlacementConfig ? (
        <EntryDetailFeaturedPlacementCard
          config={featuredPlacementConfig}
          createPending={createFeaturedPlacementConfigPending}
          featuredPlacementActive={featuredPlacementActive}
          featuredPlacementIndex={featuredPlacementIndex}
          featuredPlacementProcessing={featuredPlacementProcessing}
          featuredPlacementSlugsLength={featuredPlacementSlugsLength}
          onCreateConfig={onCreateFeaturedPlacementConfig}
          onMove={onFeaturedPlacementMove}
          onToggle={onFeaturedPlacementToggle}
          strings={strings}
        />
      ) : null}

      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardHeader>
          <CardTitle>{strings.metadataLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion
            type="multiple"
            defaultValue={['metadata']}
            className="space-y-3"
          >
            <AccordionItem
              value="metadata"
              className="rounded-[1.1rem] border border-border/70 px-4"
            >
              <AccordionTrigger>{strings.metadataLabel}</AccordionTrigger>
              <AccordionContent>
                <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/80 p-3 text-xs leading-6">
                  {JSON.stringify(activeEntry.metadata ?? {}, null, 2)}
                </pre>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="profile-data"
              className="rounded-[1.1rem] border border-border/70 px-4"
            >
              <AccordionTrigger>{strings.profileDataLabel}</AccordionTrigger>
              <AccordionContent>
                <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/80 p-3 text-xs leading-6">
                  {JSON.stringify(activeEntry.profile_data ?? {}, null, 2)}
                </pre>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="binding"
              className="rounded-[1.1rem] border border-border/70 px-4"
            >
              <AccordionTrigger>
                {strings.workspaceBindingLabel}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <div className="rounded-xl border border-border/70 bg-background/75 px-3 py-2">
                    {binding.canonical_id ?? strings.noCanonicalIdLabel}
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/75 px-3 py-2">
                    {binding.adapter ?? strings.noAdapterLabel}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
