'use client';

import { CheckCircle2, Clock, Link, Unlink } from '@tuturuuu/icons';
import type {
  CanonicalExternalProject,
  Json,
  WorkspaceExternalProjectBindingAudit,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { EXTERNAL_PROJECT_ADAPTER_OPTIONS } from '@/lib/external-projects/constants';

export type InternalProjectTemplateForm = {
  adapter: CanonicalExternalProject['adapter'];
  deliveryProfile: string;
  displayName: string;
  id: string;
  isActive: boolean;
};

export function formatToken(value: string | null | undefined) {
  if (!value) return '-';
  return value
    .split(/[-_]/gu)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

export function getWorkspaceLabel(
  workspace: { name: string | null },
  fallback: string
) {
  return workspace.name || fallback;
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

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/80 p-4">
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-1 font-semibold text-2xl">{value}</div>
    </div>
  );
}

export function StatusBadge({ connected }: { connected: boolean }) {
  const tRoot = useTranslations('external-projects.root');
  return (
    <Badge variant={connected ? 'default' : 'outline'} className="rounded-md">
      {connected ? (
        <Link className="mr-1 h-3.5 w-3.5" />
      ) : (
        <Unlink className="mr-1 h-3.5 w-3.5" />
      )}
      {connected
        ? tRoot('connected_status_label')
        : tRoot('unconnected_status_label')}
    </Badge>
  );
}

export function HistoryList({
  audits,
}: {
  audits: WorkspaceExternalProjectBindingAudit[];
}) {
  const tRoot = useTranslations('external-projects.root');
  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">{tRoot('history_title')}</div>
      {audits.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {tRoot('history_empty_description')}
        </p>
      ) : (
        audits.slice(0, 5).map((audit) => (
          <div
            key={audit.id}
            className="rounded-md border border-border/70 bg-background/60 p-3 text-sm"
          >
            <div>
              {audit.previous_canonical_id ?? tRoot('unbound_label')}
              {' -> '}
              {audit.next_canonical_id ?? tRoot('unbound_label')}
            </div>
            <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(audit.changed_at)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function TemplateFormEditor({
  form,
  isEditing,
  isPending,
  onChange,
  onSubmit,
  parsedProfile,
}: {
  form: InternalProjectTemplateForm;
  isEditing: boolean;
  isPending: boolean;
  onChange: (form: InternalProjectTemplateForm) => void;
  onSubmit: () => void;
  parsedProfile: Json | null;
}) {
  const tRoot = useTranslations('external-projects.root');
  const saveDisabled =
    isPending || !form.id.trim() || !form.displayName.trim() || !parsedProfile;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={tRoot('canonical_id_label')}>
          <Input
            value={form.id}
            disabled={isEditing}
            onChange={(event) => onChange({ ...form, id: event.target.value })}
          />
        </Field>
        <Field label={tRoot('display_name_label')}>
          <Input
            value={form.displayName}
            onChange={(event) =>
              onChange({ ...form, displayName: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Field label={tRoot('site_type_label')}>
          <Select
            value={form.adapter}
            onValueChange={(value) =>
              onChange({
                ...form,
                adapter: value as CanonicalExternalProject['adapter'],
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXTERNAL_PROJECT_ADAPTER_OPTIONS.map((adapter) => (
                <SelectItem key={adapter} value={adapter}>
                  {formatToken(adapter)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <label className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
          <Checkbox
            checked={form.isActive}
            onCheckedChange={(checked) =>
              onChange({ ...form, isActive: Boolean(checked) })
            }
          />
          {tRoot('active_label')}
        </label>
      </div>
      <Field label={tRoot('developer_settings_label')}>
        <Textarea
          rows={5}
          value={form.deliveryProfile}
          onChange={(event) =>
            onChange({ ...form, deliveryProfile: event.target.value })
          }
          className={
            form.deliveryProfile.trim() && parsedProfile === null
              ? 'border-destructive/70 focus-visible:ring-destructive/30'
              : undefined
          }
        />
      </Field>
      {form.deliveryProfile.trim() && parsedProfile === null ? (
        <p className="text-destructive text-sm">
          {tRoot('invalid_developer_settings_label')}
        </p>
      ) : null}
      <Button disabled={saveDisabled} onClick={onSubmit} className="gap-2">
        <CheckCircle2 className="h-4 w-4" />
        {isEditing
          ? tRoot('save_template_action')
          : tRoot('create_template_action')}
      </Button>
    </div>
  );
}
