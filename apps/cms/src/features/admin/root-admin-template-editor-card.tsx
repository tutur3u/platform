'use client';

import { CheckCircle2, Settings2 } from '@tuturuuu/icons';
import type { CanonicalExternalProject, Json } from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { type ReactNode, useState } from 'react';
import type {
  TemplateDialogStrings,
  TemplateMutationPayload,
} from './root-admin-template-types';
import { formatAdminToken } from './root-admin-utils';

function tryParseJson(value: string): Json | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function TemplateEditorCard({
  error,
  isSaving,
  onSave,
  strings,
  template,
}: {
  error: string | null;
  isSaving: boolean;
  onSave: (id: string, payload: Partial<TemplateMutationPayload>) => void;
  strings: TemplateDialogStrings;
  template: CanonicalExternalProject;
}) {
  const [displayName, setDisplayName] = useState(template.display_name);
  const [isActive, setIsActive] = useState(template.is_active);
  const [developerSettings, setDeveloperSettings] = useState(
    JSON.stringify(template.delivery_profile ?? {}, null, 2)
  );
  const parsedDeveloperSettings = tryParseJson(developerSettings);

  return (
    <div className="rounded-lg border border-border/70 bg-card/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-md">
              {formatAdminToken(template.adapter)}
            </Badge>
            <Badge
              variant={isActive ? 'default' : 'outline'}
              className="rounded-md"
            >
              {isActive ? strings.activeLabel : strings.inactiveLabel}
            </Badge>
          </div>
          <div>
            <div className="font-medium">{template.display_name}</div>
            <div className="text-muted-foreground text-sm">{template.id}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2">
          <Checkbox
            id={`active-${template.id}`}
            checked={isActive}
            onCheckedChange={(checked) => setIsActive(Boolean(checked))}
          />
          <Label htmlFor={`active-${template.id}`}>{strings.activeLabel}</Label>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_0.8fr]">
        <Field label={strings.displayNameLabel}>
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>
        <div className="rounded-lg border border-border/70 bg-background/65 p-4">
          <div className="mb-2 text-muted-foreground text-xs uppercase">
            {strings.recommendedSectionsLabel}
          </div>
          <SectionBadges sections={template.allowed_collections} />
        </div>
      </div>

      <DeveloperSettingsEditor
        className="mt-4"
        errorLabel={strings.invalidDeveloperSettings}
        hint={strings.developerSettingsHint}
        label={strings.developerSettingsLabel}
        onChange={setDeveloperSettings}
        value={developerSettings}
      />

      {error ? <p className="mt-3 text-destructive text-sm">{error}</p> : null}

      <Button
        className="mt-4 gap-2"
        disabled={
          isSaving || !displayName.trim() || parsedDeveloperSettings === null
        }
        onClick={() =>
          parsedDeveloperSettings &&
          onSave(template.id, {
            delivery_profile: parsedDeveloperSettings,
            display_name: displayName,
            is_active: isActive,
          })
        }
      >
        <CheckCircle2 className="h-4 w-4" />
        {strings.saveTemplateAction}
      </Button>
    </div>
  );
}

export function DeveloperSettingsEditor({
  className,
  errorLabel,
  hint,
  label,
  onChange,
  value,
}: {
  className?: string;
  errorLabel: string;
  hint: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const parsedValue = tryParseJson(value);

  return (
    <Accordion className={className} type="single" collapsible>
      <AccordionItem
        value="developer-settings"
        className="rounded-lg border border-border/70 bg-background/65 px-4"
      >
        <AccordionTrigger>
          <span className="inline-flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            {label}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p className="text-muted-foreground text-xs">{hint}</p>
          <Textarea
            rows={7}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={
              value.trim() && parsedValue === null
                ? 'border-destructive/70 focus-visible:ring-destructive/30'
                : undefined
            }
          />
          {value.trim() && parsedValue === null ? (
            <p className="text-destructive text-xs">{errorLabel}</p>
          ) : null}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function SectionBadges({ sections }: { sections: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sections.map((section) => (
        <Badge key={section} variant="secondary" className="rounded-md">
          {formatAdminToken(section)}
        </Badge>
      ))}
    </div>
  );
}
