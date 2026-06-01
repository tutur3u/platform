'use client';

import { Plus, Search } from '@tuturuuu/icons';
import type { CanonicalExternalProject, Json } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useState } from 'react';
import {
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS,
  EXTERNAL_PROJECT_ADAPTER_OPTIONS,
} from '@/lib/external-projects/constants';
import {
  DeveloperSettingsEditor,
  Field,
  SectionBadges,
  TemplateEditorCard,
} from './root-admin-template-editor-card';
import type {
  TemplateDialogStrings,
  TemplateMutationPayload,
} from './root-admin-template-types';
import { formatAdminToken } from './root-admin-utils';

type TemplateDialogProps = {
  createError: string | null;
  isCreating: boolean;
  onCreateTemplate: (payload: TemplateMutationPayload) => void;
  onOpenChange: (open: boolean) => void;
  onUpdateTemplate: (
    id: string,
    payload: Partial<TemplateMutationPayload>
  ) => void;
  open: boolean;
  strings: TemplateDialogStrings;
  templates: CanonicalExternalProject[];
  updateError: string | null;
  updatingTemplateId: string | null;
};

function buildDefaultSettings(adapter: CanonicalExternalProject['adapter']) {
  return JSON.stringify(
    {
      adapter,
      deliveryPreset: `${adapter}-default`,
    },
    null,
    2
  );
}

function tryParseJson(value: string): Json | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function RootAdminTemplateDialog({
  createError,
  isCreating,
  onCreateTemplate,
  onOpenChange,
  onUpdateTemplate,
  open,
  strings,
  templates,
  updateError,
  updatingTemplateId,
}: TemplateDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [adapterFilter, setAdapterFilter] = useState('all');
  const [createForm, setCreateForm] = useState({
    adapter: 'junly' as CanonicalExternalProject['adapter'],
    developerSettings: buildDefaultSettings('junly'),
    displayName: '',
    id: '',
  });
  const createSettings = tryParseJson(createForm.developerSettings);
  const filteredTemplates = templates.filter((template) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      template.id.toLowerCase().includes(query) ||
      template.display_name.toLowerCase().includes(query);
    const matchesAdapter =
      adapterFilter === 'all' || template.adapter === adapterFilter;
    return matchesQuery && matchesAdapter;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="border-border/70 border-b px-6 py-5">
          <DialogTitle>{strings.templateManagerTitle}</DialogTitle>
          <DialogDescription>
            {strings.templateManagerDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <section className="rounded-lg border border-border/70 bg-card/70 p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-md border border-border/70 p-2 text-muted-foreground">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">{strings.createTemplateTitle}</div>
                <div className="text-muted-foreground text-sm">
                  {strings.createTemplateDescription}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label={strings.displayNameLabel}>
                <Input
                  value={createForm.displayName}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={strings.templateKeyLabel}>
                <Input
                  value={createForm.id}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      id: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={strings.siteTypeLabel}>
                <Select
                  value={createForm.adapter}
                  onValueChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      adapter: value as CanonicalExternalProject['adapter'],
                      developerSettings: buildDefaultSettings(
                        value as CanonicalExternalProject['adapter']
                      ),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXTERNAL_PROJECT_ADAPTER_OPTIONS.map((adapter) => (
                      <SelectItem key={adapter} value={adapter}>
                        {formatAdminToken(adapter)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="rounded-lg border border-border/70 bg-background/65 p-4">
                <div className="mb-2 text-muted-foreground text-xs uppercase">
                  {strings.recommendedSectionsLabel}
                </div>
                <SectionBadges
                  sections={
                    DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[createForm.adapter]
                  }
                />
              </div>
            </div>

            <DeveloperSettingsEditor
              className="mt-4"
              errorLabel={strings.invalidDeveloperSettings}
              hint={strings.developerSettingsHint}
              label={strings.developerSettingsLabel}
              onChange={(value) =>
                setCreateForm((current) => ({
                  ...current,
                  developerSettings: value,
                }))
              }
              value={createForm.developerSettings}
            />

            {createError ? (
              <p className="mt-3 text-destructive text-sm">{createError}</p>
            ) : null}

            <Button
              className="mt-4 gap-2"
              disabled={
                isCreating ||
                !createForm.displayName.trim() ||
                !createForm.id.trim() ||
                createSettings === null
              }
              onClick={() =>
                createSettings &&
                onCreateTemplate({
                  adapter: createForm.adapter,
                  allowed_collections:
                    DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[createForm.adapter],
                  allowed_features: [],
                  delivery_profile: createSettings,
                  display_name: createForm.displayName,
                  id: createForm.id,
                  is_active: true,
                  metadata: {},
                })
              }
            >
              <Plus className="h-4 w-4" />
              {strings.createTemplateAction}
            </Button>
          </section>

          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={strings.searchPlaceholder}
                  className="pl-9"
                />
              </div>
              <Select value={adapterFilter} onValueChange={setAdapterFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{strings.allSiteTypes}</SelectItem>
                  {EXTERNAL_PROJECT_ADAPTER_OPTIONS.map((adapter) => (
                    <SelectItem key={adapter} value={adapter}>
                      {formatAdminToken(adapter)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredTemplates.length === 0 ? (
              <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center">
                <div className="font-medium">{strings.emptyTemplateTitle}</div>
                <div className="mt-2 text-muted-foreground text-sm">
                  {strings.emptyTemplateDescription}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTemplates.map((template) => (
                  <TemplateEditorCard
                    key={template.id}
                    error={
                      updatingTemplateId === template.id ? updateError : null
                    }
                    isSaving={updatingTemplateId === template.id}
                    onSave={onUpdateTemplate}
                    strings={strings}
                    template={template}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
