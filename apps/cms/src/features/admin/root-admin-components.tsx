'use client';

import { CheckCircle2, Link } from '@tuturuuu/icons';
import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
  Json,
} from '@tuturuuu/types';
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
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

type MetricTone = 'blue' | 'green' | 'orange' | 'purple';

function tryParseJson(value: string): Json | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function formatCanonicalToken(value: string) {
  return value
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function formatAuditTime(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString();
}

export function getWorkspaceLabel(
  workspace: Pick<ExternalProjectWorkspaceBindingSummary, 'name'>,
  unnamedLabel: string
) {
  return workspace.name || unnamedLabel;
}

export function MetricCard({
  icon,
  label,
  tone = 'blue',
  value,
}: {
  icon: ReactNode;
  label: string;
  tone?: MetricTone;
  value: string;
}) {
  const toneClassNames = {
    blue: 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue',
    green: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
    orange: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
    purple: 'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
  } satisfies Record<MetricTone, string>;

  return (
    <div className="rounded-lg border border-border/70 bg-background/75 p-4">
      <div
        className={cn(
          'mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md border',
          toneClassNames[tone]
        )}
      >
        {icon}
      </div>
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-1 font-semibold text-2xl">{value}</div>
    </div>
  );
}

export function EmptyPanel({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 border-dashed bg-background/60 px-4 py-8 text-center">
      <div className="font-medium">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-muted-foreground text-sm leading-6">
        {description}
      </div>
    </div>
  );
}

export function WorkspaceStatusBadge({ enabled }: { enabled: boolean }) {
  const t = useTranslations();

  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md',
        enabled
          ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
          : 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
      )}
    >
      {enabled ? t('common.enabled') : t('common.disabled')}
    </Badge>
  );
}

export function WorkspaceSummaryButton({
  isSelected,
  onClick,
  workspace,
}: {
  isSelected: boolean;
  onClick: () => void;
  workspace: ExternalProjectWorkspaceBindingSummary;
}) {
  const t = useTranslations();
  const tRoot = useTranslations('external-projects.root');

  return (
    <button
      type="button"
      className={cn(
        'group w-full rounded-lg border p-3 text-left transition-colors',
        isSelected
          ? 'border-foreground/25 bg-foreground text-background ring-1 ring-foreground/10'
          : 'border-border/70 bg-background/80 hover:border-foreground/20 hover:bg-background'
      )}
      onClick={onClick}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate font-medium">
              {getWorkspaceLabel(workspace, t('common.unnamed-workspace'))}
            </div>
            <WorkspaceStatusBadge enabled={workspace.binding.enabled} />
            {workspace.personal ? (
              <Badge
                variant="secondary"
                className="rounded-md bg-background/80 text-foreground"
              >
                {t('common.personal_account')}
              </Badge>
            ) : null}
          </div>
          <div
            className={cn(
              'text-sm',
              isSelected ? 'text-background/70' : 'text-muted-foreground'
            )}
          >
            {workspace.binding.canonical_project?.display_name ??
              workspace.binding.canonical_id ??
              tRoot('unbound_label')}
          </div>
        </div>

        <div
          className={cn(
            'shrink-0 space-y-2 text-right text-xs',
            isSelected ? 'text-background/70' : 'text-muted-foreground'
          )}
        >
          <div className="font-medium">
            {workspace.binding.adapter
              ? formatCanonicalToken(workspace.binding.adapter)
              : tRoot('unbound_label')}
          </div>
          <div>{formatAuditTime(workspace.last_changed_at)}</div>
        </div>
      </div>
    </button>
  );
}

export function ProjectRegistryCard({
  onPrepareBinding,
  onSave,
  project,
}: {
  onPrepareBinding: () => void;
  onSave: (
    displayName: string,
    isActive: boolean,
    deliveryProfile: Json
  ) => void;
  project: CanonicalExternalProject;
}) {
  const tRoot = useTranslations('external-projects.root');
  const [displayName, setDisplayName] = useState(project.display_name);
  const [isActive, setIsActive] = useState(project.is_active);
  const [deliveryProfileText, setDeliveryProfileText] = useState(
    JSON.stringify(project.delivery_profile ?? {}, null, 2)
  );

  const deliveryProfileJson = tryParseJson(deliveryProfileText);

  return (
    <div className="rounded-lg border border-border/70 bg-background/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-md">
              {formatCanonicalToken(project.adapter)}
            </Badge>
            <Badge
              variant={isActive ? 'default' : 'outline'}
              className="rounded-md"
            >
              {isActive ? tRoot('active_label') : tRoot('inactive_label')}
            </Badge>
          </div>
          <div>
            <div className="font-medium text-lg">{project.display_name}</div>
            <div className="text-muted-foreground text-sm">
              {project.id} · {tRoot('adapter_label')}:{' '}
              {formatCanonicalToken(project.adapter)}
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          className="border-border/70 hover:bg-background"
          onClick={onPrepareBinding}
        >
          <Link className="mr-2 h-4 w-4" />
          {tRoot('use_for_binding_action')}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.62fr_0.38fr]">
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>{tRoot('display_name_label')}</Label>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <Accordion type="single" collapsible>
            <AccordionItem
              value="developer-settings"
              className="rounded-lg border border-border/70 bg-card/70 px-3"
            >
              <AccordionTrigger>
                {tRoot('delivery_profile_label')}
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  {tRoot('delivery_profile_hint')}
                </p>
                <Textarea
                  rows={6}
                  value={deliveryProfileText}
                  onChange={(event) =>
                    setDeliveryProfileText(event.target.value)
                  }
                  className={
                    deliveryProfileText.trim() && deliveryProfileJson === null
                      ? 'border-destructive/70 focus-visible:ring-destructive/30'
                      : undefined
                  }
                />
                {deliveryProfileText.trim() && deliveryProfileJson === null ? (
                  <p className="text-destructive text-xs">
                    {tRoot('invalid_json_label')}
                  </p>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-background/70 p-4">
            <div className="mb-2 text-muted-foreground text-xs uppercase">
              {tRoot('recommended_collections_label')}
            </div>
            <div className="flex flex-wrap gap-2">
              {project.allowed_collections.map((collection) => (
                <Badge
                  key={collection}
                  variant="secondary"
                  className="rounded-md"
                >
                  {formatCanonicalToken(collection)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3">
            <Checkbox
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
              id={`active-${project.id}`}
            />
            <Label htmlFor={`active-${project.id}`}>
              {tRoot('active_label')}
            </Label>
          </div>

          <Button
            className="w-full gap-2"
            onClick={() =>
              deliveryProfileJson &&
              onSave(displayName, isActive, deliveryProfileJson)
            }
            disabled={!displayName.trim() || deliveryProfileJson === null}
          >
            <CheckCircle2 className="h-4 w-4" />
            {tRoot('save_action')}
          </Button>
        </div>
      </div>
    </div>
  );
}
