'use client';

import type { ExternalProjectFieldDefinition } from '@tuturuuu/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { CmsStrings } from '../../cms-strings';

type EntrySchemaValues = Record<string, unknown>;

function stringifyFieldValue(value: unknown) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string').join('\n');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function parseStringArray(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonDraft(value: string) {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function updateFieldValue(
  current: EntrySchemaValues,
  key: string,
  value: unknown
) {
  const next = { ...current };
  const isEmptyArray = Array.isArray(value) && value.length === 0;

  if (
    value === null ||
    typeof value === 'undefined' ||
    value === '' ||
    isEmptyArray
  ) {
    delete next[key];
  } else {
    next[key] = value;
  }

  return next;
}

function FieldControl({
  definition,
  onChange,
  strings,
  value,
}: {
  definition: ExternalProjectFieldDefinition;
  onChange: (value: unknown) => void;
  strings: CmsStrings;
  value: unknown;
}) {
  const inputId = `entry-schema-field-${definition.id}`;
  const label = definition.label ?? definition.key;
  const requiredLabel = definition.is_required
    ? ` ${strings.fieldRequiredLabel}`
    : '';

  if (definition.field_type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/70 px-3 py-3">
        <Label htmlFor={inputId} className="leading-5">
          {label}
          {requiredLabel}
        </Label>
        <Switch
          id={inputId}
          checked={value === true}
          onCheckedChange={onChange}
        />
      </div>
    );
  }

  if (definition.field_type === 'string' && definition.options.length > 0) {
    return (
      <div className="space-y-2">
        <Label htmlFor={inputId}>
          {label}
          {requiredLabel}
        </Label>
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={onChange}
        >
          <SelectTrigger id={inputId}>
            <SelectValue placeholder={strings.noneLabel} />
          </SelectTrigger>
          <SelectContent>
            {definition.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (definition.field_type === 'markdown') {
    return (
      <div className="space-y-2">
        <Label htmlFor={inputId}>
          {label}
          {requiredLabel}
        </Label>
        <Textarea
          id={inputId}
          rows={6}
          value={stringifyFieldValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  if (definition.field_type === 'string-array') {
    return (
      <div className="space-y-2">
        <Label htmlFor={inputId}>
          {label}
          {requiredLabel}
        </Label>
        <Textarea
          id={inputId}
          rows={4}
          value={stringifyFieldValue(value)}
          onChange={(event) => onChange(parseStringArray(event.target.value))}
        />
        <p className="text-muted-foreground text-xs">
          {strings.stringArrayFieldHint}
        </p>
      </div>
    );
  }

  if (definition.field_type === 'json') {
    return (
      <div className="space-y-2">
        <Label htmlFor={inputId}>
          {label}
          {requiredLabel}
        </Label>
        <Textarea
          id={inputId}
          rows={6}
          value={stringifyFieldValue(value)}
          onChange={(event) => onChange(parseJsonDraft(event.target.value))}
        />
        <p className="text-muted-foreground text-xs">{strings.jsonFieldHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {label}
        {requiredLabel}
      </Label>
      <Input
        id={inputId}
        type={
          definition.field_type === 'number'
            ? 'number'
            : definition.field_type === 'datetime'
              ? 'datetime-local'
              : definition.field_type === 'date'
                ? 'date'
                : 'text'
        }
        value={stringifyFieldValue(value)}
        onChange={(event) => {
          if (definition.field_type === 'number') {
            const nextValue = event.target.value;
            onChange(nextValue.trim() ? Number(nextValue) : null);
            return;
          }

          onChange(event.target.value);
        }}
      />
    </div>
  );
}

export function EntryDetailSchemaFieldsCard({
  fieldDefinitions,
  metadata,
  onMetadataChange,
  onProfileDataChange,
  profileData,
  strings,
}: {
  fieldDefinitions: ExternalProjectFieldDefinition[];
  metadata: EntrySchemaValues;
  onMetadataChange: (value: EntrySchemaValues) => void;
  onProfileDataChange: (value: EntrySchemaValues) => void;
  profileData: EntrySchemaValues;
  strings: CmsStrings;
}) {
  if (fieldDefinitions.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-none">
      <CardHeader>
        <CardTitle>{strings.schemaFieldsTitle}</CardTitle>
        <CardDescription>{strings.schemaFieldsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {fieldDefinitions.map((definition) => {
          const values =
            definition.field_scope === 'metadata' ? metadata : profileData;
          const onValuesChange =
            definition.field_scope === 'metadata'
              ? onMetadataChange
              : onProfileDataChange;

          return (
            <FieldControl
              key={definition.id}
              definition={definition}
              strings={strings}
              value={values[definition.key]}
              onChange={(value) =>
                onValuesChange(updateFieldValue(values, definition.key, value))
              }
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
