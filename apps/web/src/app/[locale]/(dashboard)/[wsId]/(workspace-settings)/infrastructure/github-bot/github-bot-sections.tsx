'use client';

import { CheckCircle2, KeyRound, Trash2, XCircle } from '@tuturuuu/icons';
import type {
  GitHubBotConfigurationStatus,
  GitHubBotState,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import type { ReactNode } from 'react';

export function StatusBadge({
  disabledLabel,
  enabled,
  enabledLabel,
}: {
  disabledLabel: string;
  enabled: boolean;
  enabledLabel: string;
}) {
  return enabled ? (
    <Badge>
      <CheckCircle2 className="mr-1 h-3 w-3" />
      {enabledLabel}
    </Badge>
  ) : (
    <Badge variant="secondary">
      <XCircle className="mr-1 h-3 w-3" />
      {disabledLabel}
    </Badge>
  );
}

export function Field({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function GitHubBotSummaryCards({
  configuration,
  labels,
}: {
  configuration: GitHubBotConfigurationStatus | null;
  labels: {
    disabled: string;
    enabled: string;
    lastValidation: string;
    notConfigured: string;
    notValidated: string;
    repository: string;
    status: string;
  };
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-md border p-3">
        <div className="text-muted-foreground text-sm">{labels.status}</div>
        <div className="mt-2">
          <StatusBadge
            disabledLabel={labels.disabled}
            enabled={Boolean(configuration?.enabled)}
            enabledLabel={labels.enabled}
          />
        </div>
      </div>
      <div className="rounded-md border p-3">
        <div className="text-muted-foreground text-sm">{labels.repository}</div>
        <div className="mt-2 truncate font-mono text-sm">
          {configuration
            ? `${configuration.repository.owner}/${configuration.repository.name}`
            : labels.notConfigured}
        </div>
      </div>
      <div className="rounded-md border p-3">
        <div className="text-muted-foreground text-sm">
          {labels.lastValidation}
        </div>
        <div className="mt-2 text-sm">
          {configuration?.lastValidatedAt
            ? new Date(configuration.lastValidatedAt).toLocaleString()
            : labels.notValidated}
        </div>
      </div>
    </div>
  );
}

export function GitHubBotClientsList({
  clients,
  labels,
  onRevoke,
  revokePending,
}: {
  clients: GitHubBotState['clients'];
  labels: {
    expiresAt: (value: string) => string;
    noClients: string;
    revoke: string;
    revoked: string;
  };
  onRevoke: (clientId: string) => void;
  revokePending: boolean;
}) {
  return (
    <div className="grid gap-2">
      {clients.length === 0 && (
        <div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
          {labels.noClients}
        </div>
      )}
      {clients.map((client) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
          key={client.id}
        >
          <div>
            <div className="font-medium">{client.name}</div>
            <div className="text-muted-foreground text-xs">
              {client.prefix}...{client.lastFour}
            </div>
            <div className="text-muted-foreground text-xs">
              {labels.expiresAt(new Date(client.expiresAt).toLocaleString())}
            </div>
          </div>
          <Button
            disabled={Boolean(client.revokedAt) || revokePending}
            onClick={() => onRevoke(client.id)}
            size="sm"
            variant="outline"
          >
            {client.revokedAt ? (
              <XCircle className="mr-2 h-4 w-4" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {client.revokedAt ? labels.revoked : labels.revoke}
          </Button>
        </div>
      ))}
    </div>
  );
}

export function GitHubBotAuditEvents({
  auditEvents,
  labels,
}: {
  auditEvents: GitHubBotState['auditEvents'];
  labels: {
    auditTitle: string;
    noAuditEvents: string;
  };
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-base">{labels.auditTitle}</h2>
      <div className="grid gap-2">
        {auditEvents.slice(0, 12).map((event) => (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
            key={event.id}
          >
            <span>{event.eventType}</span>
            <span className="text-muted-foreground text-xs">
              {new Date(event.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
        {auditEvents.length === 0 && (
          <div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
            {labels.noAuditEvents}
          </div>
        )}
      </div>
    </div>
  );
}

export function WatcherEnvSnippet({
  snippet,
  title,
}: {
  snippet: string;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-medium text-sm">
        <KeyRound className="h-4 w-4" />
        {title}
      </div>
      <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
        {snippet}
      </pre>
    </div>
  );
}
