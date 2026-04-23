'use client';

import { ListOrdered, Tags, X } from '@tuturuuu/icons';
import type { ExternalProjectEntry } from '@tuturuuu/types';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import type { CmsStrings } from './cms-strings';

function asProfileDataRecord(
  value: ExternalProjectEntry['profile_data'] | null | undefined
) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

function getEntryCategory(entry: ExternalProjectEntry | null) {
  const value = asProfileDataRecord(entry?.profile_data).category;
  return typeof value === 'string' ? value.trim() : '';
}

function getEntryTags(entry: ExternalProjectEntry | null) {
  return [
    ...new Set(asStringArray(asProfileDataRecord(entry?.profile_data).tags)),
  ];
}

function TaxonomyChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-foreground text-sm transition-colors hover:bg-primary/15"
      onClick={onRemove}
    >
      <span className="truncate">{label}</span>
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

export function CmsLibraryTaxonomyDialog({
  categoryOptions,
  entry,
  onCreateCategory,
  onCreateTags,
  onDeleteCategoryOption,
  onDeleteTagOption,
  onOpenChange,
  onSetCategory,
  onSetTags,
  open,
  strings,
  tagOptions,
}: {
  categoryOptions: string[];
  entry: ExternalProjectEntry | null;
  onCreateCategory: (value: string) => void;
  onCreateTags: (value: string) => void;
  onDeleteCategoryOption: (value: string) => void;
  onDeleteTagOption: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSetCategory: (value: string) => void;
  onSetTags: (value: string[]) => void;
  open: boolean;
  pending: boolean;
  strings: CmsStrings;
  tagOptions: string[];
}) {
  const selectedCategory = getEntryCategory(entry);
  const selectedTags = getEntryTags(entry);
  const categoryComboboxOptions: ComboboxOption[] = categoryOptions.map(
    (category) => ({
      description: strings.categoryExistingDescription,
      label: category,
      value: category,
    })
  );
  const tagComboboxOptions: ComboboxOption[] = tagOptions.map((tag) => ({
    description: strings.tagsExistingDescription,
    label: tag,
    value: tag,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-[1.8rem] border-border/70 bg-card/98 p-0 shadow-2xl sm:max-w-xl">
        <DialogHeader className="border-border/70 border-b px-6 py-5">
          <DialogTitle>{strings.quickTaxonomyAction}</DialogTitle>
          <DialogDescription className="mt-2 max-w-lg">
            {strings.quickTaxonomyDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-6">
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              {strings.categoryLabel}
            </Label>
            <Combobox
              className="min-w-0"
              mode="single"
              options={categoryComboboxOptions}
              selected={selectedCategory}
              createText={strings.categoryCreateAction}
              emptyText={strings.categoryLibraryEmpty}
              label={
                selectedCategory ? (
                  <span className="truncate">{selectedCategory}</span>
                ) : undefined
              }
              placeholder={strings.categoryPickerPlaceholder}
              searchPlaceholder={strings.categorySearchPlaceholder}
              onChange={(value) =>
                onSetCategory(typeof value === 'string' ? value : '')
              }
              onCreate={onCreateCategory}
            />
            {selectedCategory ? (
              <div className="flex flex-wrap gap-2">
                <TaxonomyChip
                  label={selectedCategory}
                  onRemove={() => onSetCategory('')}
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {strings.noneLabel}
              </p>
            )}
            {categoryOptions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
                  {strings.categoryLibraryLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map((category) => (
                    <TaxonomyChip
                      key={category}
                      label={category}
                      onRemove={() => onDeleteCategoryOption(category)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              {strings.tagsLabel}
            </Label>
            <Combobox
              className="min-w-0"
              mode="multiple"
              options={tagComboboxOptions}
              selected={selectedTags}
              createText={strings.tagsCreateAction}
              emptyText={strings.tagLibraryEmpty}
              label={
                selectedTags.length > 0 ? (
                  <span className="truncate">{selectedTags.join(', ')}</span>
                ) : undefined
              }
              placeholder={strings.tagsPickerPlaceholder}
              searchPlaceholder={strings.tagsSearchPlaceholder}
              onChange={(value) => onSetTags(value as string[])}
              onCreate={onCreateTags}
            />
            {selectedTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedTags.map((tag) => (
                  <TaxonomyChip
                    key={tag}
                    label={`#${tag}`}
                    onRemove={() =>
                      onSetTags(selectedTags.filter((value) => value !== tag))
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {strings.tagsEmpty}
              </p>
            )}
            {tagOptions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
                  {strings.tagLibraryLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {tagOptions.map((tag) => (
                    <TaxonomyChip
                      key={tag}
                      label={`#${tag}`}
                      onRemove={() => onDeleteTagOption(tag)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
