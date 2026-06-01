'use client';

import { Activity, Clock, Link, ShieldCheck, Unlink } from '@tuturuuu/icons';
import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
  WorkspaceExternalProjectBindingAudit,
} from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { ReactNode } from 'react';
import {
  formatAdminTime,
  formatAdminToken,
  getActiveTemplates,
  getAuditsForWorkspace,
  getProjectAdapterLabel,
  getProjectTemplateLabel,
  getWorkspaceLabel,
} from './root-admin-utils';

export type ProjectDialogStrings = {
  auditEmptyDescription: string;
  auditEmptyTitle: string;
  changeHistoryTitle: string;
  connectedStatus: string;
  connectionErrorTitle: string;
  developerDetailsTitle: string;
  disconnectAction: string;
  internalIdLabel: string;
  lastChangedLabel: string;
  noTemplateOption: string;
  projectDetailsDescription: string;
  saveConnectionAction: string;
  savingAction: string;
  selectedTemplateLabel: string;
  siteTypeLabel: string;
  templateKeyLabel: string;
  templateLabel: string;
  unboundLabel: string;
  unconnectedStatus: string;
  unnamedWorkspace: string;
};

type ProjectDialogProps = {
  audits: WorkspaceExternalProjectBindingAudit[];
  connectionError: string | null;
  draftCanonicalId: string;
  isSavingConnection: boolean;
  onDraftCanonicalIdChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSaveConnection: () => void;
  open: boolean;
  strings: ProjectDialogStrings;
  templates: CanonicalExternalProject[];
  workspace: ExternalProjectWorkspaceBindingSummary | null;
};

export function RootAdminProjectDialog({
  audits,
  connectionError,
  draftCanonicalId,
  isSavingConnection,
  onDraftCanonicalIdChange,
  onOpenChange,
  onSaveConnection,
  open,
  strings,
  templates,
  workspace,
}: ProjectDialogProps) {
  const activeTemplates = getActiveTemplates(templates);
  const currentTemplate =
    templates.find((template) => template.id === draftCanonicalId) ?? null;
  const workspaceAudits = workspace
    ? getAuditsForWorkspace(audits, workspace.id)
    : [];
  const isConnected = Boolean(workspace?.binding.enabled);
  const unchanged =
    (workspace?.binding.canonical_id ?? '') === (draftCanonicalId || '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="border-border/70 border-b px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4 pr-8">
            <div className="space-y-2">
              <DialogTitle className="text-2xl">
                {workspace
                  ? getWorkspaceLabel(workspace, strings.unnamedWorkspace)
                  : strings.unboundLabel}
              </DialogTitle>
              <DialogDescription>
                {strings.projectDetailsDescription}
              </DialogDescription>
            </div>
            {workspace ? (
              <Badge
                variant={isConnected ? 'default' : 'outline'}
                className="rounded-md"
              >
                {isConnected ? (
                  <Link className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Unlink className="mr-1 h-3.5 w-3.5" />
                )}
                {isConnected
                  ? strings.connectedStatus
                  : strings.unconnectedStatus}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        {workspace ? (
          <div className="space-y-6 px-6 py-5">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryBox
                icon={<ShieldCheck className="h-4 w-4" />}
                label={strings.templateLabel}
                value={getProjectTemplateLabel(workspace, strings.unboundLabel)}
              />
              <SummaryBox
                icon={<Activity className="h-4 w-4" />}
                label={strings.siteTypeLabel}
                value={getProjectAdapterLabel(workspace, strings.unboundLabel)}
              />
              <SummaryBox
                icon={<Clock className="h-4 w-4" />}
                label={strings.lastChangedLabel}
                value={formatAdminTime(workspace.last_changed_at)}
              />
            </div>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_0.9fr]">
              <div className="rounded-lg border border-border/70 bg-card/70 p-4">
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label>{strings.selectedTemplateLabel}</Label>
                    <Select
                      value={draftCanonicalId || '__unbound__'}
                      onValueChange={(value) =>
                        onDraftCanonicalIdChange(
                          value === '__unbound__' ? '' : value
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unbound__">
                          {strings.noTemplateOption}
                        </SelectItem>
                        {activeTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {currentTemplate ? (
                    <div className="rounded-lg border border-border/70 bg-background/65 p-4">
                      <div className="font-medium">
                        {currentTemplate.display_name}
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {strings.siteTypeLabel}:{' '}
                        {formatAdminToken(currentTemplate.adapter)}
                      </div>
                    </div>
                  ) : null}

                  {connectionError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
                      <div className="font-medium">
                        {strings.connectionErrorTitle}
                      </div>
                      <div className="mt-1">{connectionError}</div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={unchanged || isSavingConnection}
                      onClick={onSaveConnection}
                    >
                      {isSavingConnection
                        ? strings.savingAction
                        : strings.saveConnectionAction}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!draftCanonicalId || isSavingConnection}
                      onClick={() => onDraftCanonicalIdChange('')}
                    >
                      {strings.disconnectAction}
                    </Button>
                  </div>
                </div>
              </div>

              <section className="rounded-lg border border-border/70 bg-background/55 p-4">
                <div className="font-medium">{strings.changeHistoryTitle}</div>
                {workspaceAudits.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-border/70 border-dashed px-4 py-8 text-center">
                    <div className="font-medium">{strings.auditEmptyTitle}</div>
                    <div className="mt-2 text-muted-foreground text-sm">
                      {strings.auditEmptyDescription}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {workspaceAudits.map((audit) => (
                      <div
                        key={audit.id}
                        className="rounded-lg border border-border/70 bg-card/70 p-3"
                      >
                        <div className="font-medium text-sm">
                          {audit.previous_canonical_id ?? strings.unboundLabel}
                          {' -> '}
                          {audit.next_canonical_id ?? strings.unboundLabel}
                        </div>
                        <div className="mt-1 text-muted-foreground text-xs">
                          {formatAdminTime(audit.changed_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </section>

            <Accordion type="single" collapsible>
              <AccordionItem
                value="developer-details"
                className="rounded-lg border border-border/70 bg-card/60 px-4"
              >
                <AccordionTrigger>
                  {strings.developerDetailsTitle}
                </AccordionTrigger>
                <AccordionContent>
                  <dl className="grid gap-3 text-sm md:grid-cols-2">
                    <DeveloperDetail
                      label={strings.internalIdLabel}
                      value={workspace.id}
                    />
                    <DeveloperDetail
                      label={strings.templateKeyLabel}
                      value={workspace.binding.canonical_id ?? '-'}
                    />
                  </dl>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryBox({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/65 p-4">
      <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted-foreground">
        {icon}
      </div>
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}

function DeveloperDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs">{value}</dd>
    </div>
  );
}
