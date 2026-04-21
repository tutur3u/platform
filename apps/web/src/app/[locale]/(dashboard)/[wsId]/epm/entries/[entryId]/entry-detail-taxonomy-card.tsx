'use client';

import { Check, ListOrdered, Plus, Tags, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import type { EpmStrings } from '../../epm-strings';

type EntryDetailTaxonomyCardProps = {
  categoryCreateOpen: boolean;
  categoryDraft: string;
  categoryOptions: ComboboxOption[];
  configuredCategoryOptions: string[];
  configuredTagOptions: string[];
  isTaxonomyConfigEditor: boolean;
  onAddTags: (value: string) => void;
  onApplyCategory: (value: string) => void;
  onCategoryCreateOpenChange: (open: boolean) => void;
  onCategoryDraftChange: (value: string) => void;
  onCategorySelectionChange: (value: string | string[]) => void;
  onClearCategories: () => void;
  onClearTags: () => void;
  onRemoveCategory: (category: string) => void;
  onRemoveTag: (tag: string) => void;
  onTagCreateOpenChange: (open: boolean) => void;
  onTagDraftChange: (value: string) => void;
  onTagSelectionChange: (value: string[]) => void;
  selectedCategory: string;
  selectedTags: string[];
  strings: EpmStrings;
  tagCreateOpen: boolean;
  tagDraft: string;
  tagOptions: ComboboxOption[];
};

function RemovableChip({
  label,
  onRemove,
  srText,
}: {
  label: string;
  onRemove: () => void;
  srText: string;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent/40"
      onClick={onRemove}
    >
      <span>{label}</span>
      <X className="h-3.5 w-3.5" />
      <span className="sr-only">{srText}</span>
    </button>
  );
}

function InlineCreateRow({
  confirmLabel,
  onCancel,
  onConfirm,
  onValueChange,
  placeholder,
  value,
}: {
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/50 p-2">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onConfirm();
          }
        }}
      />
      <Button
        type="button"
        size="icon"
        disabled={!value.trim()}
        onClick={onConfirm}
      >
        <Check className="h-4 w-4" />
        <span className="sr-only">{confirmLabel}</span>
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onCancel}>
        <X className="h-4 w-4" />
        <span className="sr-only">{confirmLabel}</span>
      </Button>
    </div>
  );
}

export function EntryDetailTaxonomyCard({
  categoryCreateOpen,
  categoryDraft,
  categoryOptions,
  configuredCategoryOptions,
  configuredTagOptions,
  isTaxonomyConfigEditor,
  onAddTags,
  onApplyCategory,
  onCategoryCreateOpenChange,
  onCategoryDraftChange,
  onCategorySelectionChange,
  onClearCategories,
  onClearTags,
  onRemoveCategory,
  onRemoveTag,
  onTagCreateOpenChange,
  onTagDraftChange,
  onTagSelectionChange,
  selectedCategory,
  selectedTags,
  strings,
  tagCreateOpen,
  tagDraft,
  tagOptions,
}: EntryDetailTaxonomyCardProps) {
  const visibleCategories = isTaxonomyConfigEditor
    ? configuredCategoryOptions
    : selectedCategory
      ? [selectedCategory]
      : [];
  const visibleTags = isTaxonomyConfigEditor
    ? configuredTagOptions
    : selectedTags;

  return (
    <div className="space-y-3 rounded-[1.1rem] border border-border/70 bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <Label className="flex items-center gap-2">
            <Badge variant="outline" className="size-6 rounded-md p-0">
              <ListOrdered className="m-auto h-3.5 w-3.5" />
            </Badge>
            {isTaxonomyConfigEditor
              ? strings.categoryLibraryLabel
              : strings.categoryLabel}
          </Label>
          <p className="text-muted-foreground text-xs leading-5">
            {isTaxonomyConfigEditor
              ? strings.categoryLibraryDescription
              : strings.categoryDescription}
          </p>
        </div>
        {visibleCategories.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onClearCategories}
          >
            <X className="mr-2 h-4 w-4" />
            {strings.categoryClearAction}
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Combobox
          className="min-w-0 flex-1"
          mode={isTaxonomyConfigEditor ? 'multiple' : 'single'}
          options={categoryOptions}
          selected={
            isTaxonomyConfigEditor
              ? configuredCategoryOptions
              : selectedCategory
          }
          placeholder={strings.categoryPickerPlaceholder}
          searchPlaceholder={strings.categorySearchPlaceholder}
          createText={strings.categoryCreateAction}
          emptyText={strings.emptyEntries}
          label={
            isTaxonomyConfigEditor && configuredCategoryOptions.length > 0 ? (
              <span className="truncate">
                {configuredCategoryOptions.join(', ')}
              </span>
            ) : undefined
          }
          onChange={onCategorySelectionChange}
          onCreate={onApplyCategory}
        />
        <Button
          type="button"
          size="icon"
          variant={categoryCreateOpen ? 'default' : 'outline'}
          className="size-9 shrink-0"
          onClick={() => onCategoryCreateOpenChange(!categoryCreateOpen)}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">{strings.categoryCreateAction}</span>
        </Button>
      </div>
      {categoryCreateOpen ? (
        <InlineCreateRow
          confirmLabel={strings.categoryCreateAction}
          value={categoryDraft}
          placeholder={strings.categoryCreatePlaceholder}
          onValueChange={onCategoryDraftChange}
          onConfirm={() => onApplyCategory(categoryDraft)}
          onCancel={() => {
            onCategoryCreateOpenChange(false);
            onCategoryDraftChange('');
          }}
        />
      ) : null}
      {isTaxonomyConfigEditor ? (
        configuredCategoryOptions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {configuredCategoryOptions.map((category) => (
              <RemovableChip
                key={category}
                label={category}
                srText={`${strings.categoryClearAction} ${category}`}
                onRemove={() => onRemoveCategory(category)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/70 border-dashed bg-card/50 px-3 py-3 text-muted-foreground text-sm">
            {strings.categoryLibraryEmpty}
          </div>
        )
      ) : selectedCategory ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
          <Badge variant="secondary">{selectedCategory}</Badge>
          <span className="text-muted-foreground text-xs">
            {strings.categoryActiveHint}
          </span>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Badge variant="outline" className="size-6 rounded-md p-0">
                <Tags className="m-auto h-3.5 w-3.5" />
              </Badge>
              {isTaxonomyConfigEditor
                ? strings.tagLibraryLabel
                : strings.tagsLabel}
            </Label>
            <p className="text-muted-foreground text-xs leading-5">
              {isTaxonomyConfigEditor
                ? strings.tagLibraryDescription
                : strings.tagsDescription}
            </p>
          </div>
          {visibleTags.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onClearTags}
            >
              <X className="mr-2 h-4 w-4" />
              {strings.tagsClearAction}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Combobox
            className="min-w-0 flex-1"
            mode="multiple"
            options={tagOptions}
            selected={visibleTags}
            placeholder={strings.tagsPickerPlaceholder}
            searchPlaceholder={strings.tagsSearchPlaceholder}
            createText={strings.tagsCreateAction}
            emptyText={strings.emptyEntries}
            label={
              visibleTags.length > 0 ? (
                <span className="truncate">{visibleTags.join(', ')}</span>
              ) : undefined
            }
            onChange={(value) => onTagSelectionChange(value as string[])}
            onCreate={onAddTags}
          />
          <Button
            type="button"
            size="icon"
            variant={tagCreateOpen ? 'default' : 'outline'}
            className="size-9 shrink-0"
            onClick={() => onTagCreateOpenChange(!tagCreateOpen)}
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">{strings.tagsCreateAction}</span>
          </Button>
        </div>
        {tagCreateOpen ? (
          <InlineCreateRow
            confirmLabel={strings.tagsCreateAction}
            value={tagDraft}
            placeholder={strings.tagsCreatePlaceholder}
            onValueChange={onTagDraftChange}
            onConfirm={() => onAddTags(tagDraft)}
            onCancel={() => {
              onTagCreateOpenChange(false);
              onTagDraftChange('');
            }}
          />
        ) : null}
        {visibleTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {visibleTags.map((tag) => (
              <RemovableChip
                key={tag}
                label={`#${tag}`}
                srText={`${strings.tagsRemoveAction} ${tag}`}
                onRemove={() => onRemoveTag(tag)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/70 border-dashed bg-card/50 px-3 py-3 text-muted-foreground text-sm">
            {isTaxonomyConfigEditor
              ? strings.tagLibraryEmpty
              : strings.tagsEmpty}
          </div>
        )}
      </div>
    </div>
  );
}
