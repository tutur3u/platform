'use client';

import { Database, Plus, Trash2 } from '@tuturuuu/icons';
import type {
  ExternalProjectCollection,
  ExternalProjectFieldDefinition,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  buildCmsContentModelTemplates,
  type CmsContentModelTemplate,
  getContentModelTemplateStatus,
} from './cms-content-model';
import type { CmsStrings } from './cms-strings';

function getFieldTypeLabel(
  type: ExternalProjectFieldDefinition['field_type'],
  strings: CmsStrings
) {
  switch (type) {
    case 'boolean':
      return strings.fieldTypeBoolean;
    case 'date':
      return strings.fieldTypeDate;
    case 'datetime':
      return strings.fieldTypeDatetime;
    case 'json':
      return strings.fieldTypeJson;
    case 'markdown':
      return strings.fieldTypeMarkdown;
    case 'number':
      return strings.fieldTypeNumber;
    case 'string-array':
      return strings.fieldTypeStringArray;
    default:
      return strings.fieldTypeString;
  }
}

function getFieldScopeLabel(
  scope: ExternalProjectFieldDefinition['field_scope'],
  strings: CmsStrings
) {
  return scope === 'metadata'
    ? strings.fieldScopeMetadata
    : strings.fieldScopeProfileData;
}

function TemplateCard({
  onApplyTemplate,
  pending,
  strings,
  template,
  templateInstalled,
  missingFieldCount,
}: {
  missingFieldCount: number;
  onApplyTemplate: (template: CmsContentModelTemplate) => void;
  pending: boolean;
  strings: CmsStrings;
  template: CmsContentModelTemplate;
  templateInstalled: boolean;
}) {
  return (
    <Card className="border-border/70 bg-background/70 shadow-none">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{template.title}</CardTitle>
            <CardDescription>{template.description}</CardDescription>
          </div>
          <Badge variant={templateInstalled ? 'secondary' : 'outline'}>
            {templateInstalled
              ? strings.templateInstalledLabel
              : `${missingFieldCount} ${strings.templateMissingFieldsLabel}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {template.fields.slice(0, 5).map((field) => (
            <Badge key={`${template.id}-${field.key}`} variant="secondary">
              {field.label}
            </Badge>
          ))}
        </div>
        <Button
          size="sm"
          disabled={pending || templateInstalled}
          onClick={() => onApplyTemplate(template)}
        >
          <Plus className="mr-2 h-4 w-4" />
          {templateInstalled
            ? strings.templateInstalledLabel
            : strings.applyTemplateAction}
        </Button>
      </CardContent>
    </Card>
  );
}

export function CmsContentModelSection({
  collections,
  deleteFieldDefinitionPending,
  fieldDefinitions,
  onApplyTemplate,
  onDeleteFieldDefinition,
  templatePending,
  strings,
}: {
  collections: ExternalProjectCollection[];
  deleteFieldDefinitionPending: boolean;
  fieldDefinitions: ExternalProjectFieldDefinition[];
  onApplyTemplate: (template: CmsContentModelTemplate) => void;
  onDeleteFieldDefinition: (fieldDefinitionId: string) => void;
  templatePending: boolean;
  strings: CmsStrings;
}) {
  const templates = buildCmsContentModelTemplates(strings);
  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection])
  );
  const groupedDefinitions = fieldDefinitions.reduce<
    Array<{
      collection: ExternalProjectCollection | null;
      definitions: ExternalProjectFieldDefinition[];
      key: string;
      title: string;
    }>
  >((groups, definition) => {
    const key = definition.collection_id ?? 'global';
    const group =
      groups.find((candidate) => candidate.key === key) ??
      (() => {
        const collection = definition.collection_id
          ? (collectionById.get(definition.collection_id) ?? null)
          : null;
        const nextGroup = {
          collection,
          definitions: [],
          key,
          title: collection?.title ?? strings.globalFieldsLabel,
        };
        groups.push(nextGroup);
        return nextGroup;
      })();

    group.definitions.push(definition);
    return groups;
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-4">
        <div className="rounded-[1.35rem] border border-border/70 bg-card/95 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-border/70 bg-background/80 p-2">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">
                {strings.contentModelTitle}
              </h2>
              <p className="mt-1 text-muted-foreground text-sm leading-6">
                {strings.contentModelDescription}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((template) => {
            const status = getContentModelTemplateStatus({
              collections,
              fieldDefinitions,
              template,
            });

            return (
              <TemplateCard
                key={template.id}
                missingFieldCount={status.missingFields.length}
                onApplyTemplate={onApplyTemplate}
                pending={templatePending}
                strings={strings}
                template={template}
                templateInstalled={status.installed}
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold text-base">
            {strings.fieldDefinitionsTitle}
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {strings.fieldDefinitionsDescription}
          </p>
        </div>

        {groupedDefinitions.length === 0 ? (
          <div className="rounded-[1.2rem] border border-border/70 border-dashed bg-card/80 p-4 text-muted-foreground text-sm">
            {strings.noFieldDefinitions}
          </div>
        ) : (
          groupedDefinitions.map((group) => (
            <div
              key={group.key}
              className="rounded-[1.2rem] border border-border/70 bg-card/95 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-medium text-sm">{group.title}</div>
                <Badge variant="outline">{group.definitions.length}</Badge>
              </div>
              <div className="space-y-2">
                {group.definitions.map((definition) => (
                  <div
                    key={definition.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">
                        {definition.label ?? definition.key}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {getFieldScopeLabel(definition.field_scope, strings)}
                        </Badge>
                        <Badge variant="outline">
                          {getFieldTypeLabel(definition.field_type, strings)}
                        </Badge>
                        {definition.is_required ? (
                          <Badge variant="outline">
                            {strings.fieldRequiredLabel}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      disabled={deleteFieldDefinitionPending}
                      onClick={() => onDeleteFieldDefinition(definition.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">
                        {strings.deleteFieldDefinitionAction}
                      </span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
