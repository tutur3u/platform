'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  MessageSquare,
  RefreshCw,
} from '@tuturuuu/icons';
import {
  getExternalChatBindingState,
  mutateExternalChatCredential,
  updateExternalChatSettings,
} from '@tuturuuu/internal-api';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { TTR_URL } from '@/constants/common';

export function ConnectedChatSettings({ wsId }: { wsId: string }) {
  const t = useTranslations('connected-chat');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => getExternalChatBindingState(wsId),
    queryKey: ['connected-chat', wsId],
  });
  const existing = (query.data?.settings ?? {}) as Record<string, unknown>;
  const [enabledOverride, setEnabled] = useState<boolean | null>(null);
  const [baseUrlOverride, setBaseUrl] = useState<string | null>(null);
  const [controlSecret, setControlSecret] = useState('');
  const [agentMappingsOverride, setAgentMappings] = useState<string | null>(
    null
  );
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const widgetSnippet = useMemo(
    () =>
      `<script src="${TTR_URL}/api/v1/integrations/external-chat/widget.js" data-workspace="${wsId}" async></script>`,
    [wsId]
  );
  const enabled = enabledOverride ?? existing.enabled === true;
  const baseUrl = baseUrlOverride ?? String(existing.bridgeBaseUrl ?? '');
  const agentMappings =
    agentMappingsOverride ??
    JSON.stringify(existing.agentMappings ?? {}, null, 2);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['connected-chat', wsId] });
  const settingsMutation = useMutation({
    mutationFn: async () => {
      let parsedMappings: Record<string, string>;
      try {
        parsedMappings = JSON.parse(agentMappings) as Record<string, string>;
      } catch {
        throw new Error('invalid_agent_mappings');
      }
      return updateExternalChatSettings(wsId, {
        agentMappings: parsedMappings,
        authorityMode: isAuthorityMode(existing.authorityMode)
          ? existing.authorityMode
          : 'legacy_primary',
        bridgeBaseUrl: baseUrl,
        enabled,
        inboxDefaults: (existing.inboxDefaults ?? {}) as Record<
          string,
          unknown
        >,
      });
    },
    onError: (error) =>
      toast.error(
        error.message === 'invalid_agent_mappings'
          ? t('agent_mappings_invalid')
          : t('save_error')
      ),
    onSuccess: async () => {
      setEnabled(null);
      setBaseUrl(null);
      setAgentMappings(null);
      await refresh();
      toast.success(t('saved'));
    },
  });
  const credentialMutation = useMutation({
    mutationFn: (payload: Parameters<typeof mutateExternalChatCredential>[1]) =>
      mutateExternalChatCredential(wsId, payload),
    onError: () => toast.error(t('secret_error')),
    onSuccess: async (result, action) => {
      setIssuedSecret((current) => result.secret ?? current);
      setControlSecret('');
      if (action.action === 'pair') {
        setIssuedSecret(null);
      }
      await refresh();
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2">
      <header className="border-b pb-5">
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="mt-1 text-muted-foreground text-sm">{t('description')}</p>
      </header>
      {query.isError ? (
        <Alert variant="destructive">
          <RefreshCw className="size-4" />
          <AlertTitle>{t('load_error')}</AlertTitle>
          <AlertDescription>
            <Button
              className="mt-2"
              onClick={() => query.refetch()}
              size="sm"
              variant="outline"
            >
              <RefreshCw className="size-4" />
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : query.isLoading ? null : (
        <Alert
          variant={query.data?.readiness.ready ? 'default' : 'destructive'}
        >
          {query.data?.readiness.ready ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <AlertTitle>
            {query.data?.readiness.ready ? t('ready') : t('not_ready')}
          </AlertTitle>
          <AlertDescription>
            {query.data?.readiness.ready
              ? t('ready_description')
              : t('not_ready_description', {
                  count: query.data?.readiness.errors.length ?? 1,
                })}
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-5 border-b pb-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="chat-enabled">{t('enabled')}</Label>
              <p className="text-muted-foreground text-xs">
                {t('enabled_description')}
              </p>
            </div>
            <Switch
              checked={enabled}
              disabled={!query.isSuccess}
              id="chat-enabled"
              onCheckedChange={setEnabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bridge-url">{t('bridge_url')}</Label>
            <Input
              id="bridge-url"
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://bridge.example.com"
              value={baseUrl}
            />
          </div>
          <details className="border p-3">
            <summary className="cursor-pointer font-medium text-sm">
              {t('developer_details')}
            </summary>
            <div className="mt-3 space-y-2">
              <Label htmlFor="agent-mappings">{t('agent_mappings')}</Label>
              <Textarea
                id="agent-mappings"
                onChange={(event) => setAgentMappings(event.target.value)}
                rows={5}
                value={agentMappings}
              />
            </div>
          </details>
          <Button
            disabled={
              settingsMutation.isPending ||
              credentialMutation.isPending ||
              !query.isSuccess ||
              !baseUrl
            }
            onClick={() => settingsMutation.mutate()}
          >
            {t('save')}
          </Button>
        </div>

        <div className="space-y-4 border-t pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-5">
          <div>
            <h2 className="font-medium">{t('credentials')}</h2>
            <p className="text-muted-foreground text-xs">
              {t('credentials_description')}
            </p>
          </div>
          <SecretRow
            configured={Boolean(query.data?.secrets.ingest.configured)}
            label={t('ingest_secret')}
            lastFour={query.data?.secrets.ingest.lastFour}
          />
          <Button
            disabled={credentialMutation.isPending || !query.isSuccess}
            onClick={() =>
              credentialMutation.mutate({ action: 'rotate_ingest' })
            }
            variant="outline"
          >
            <KeyRound className="size-4" />
            {t('rotate_ingest')}
          </Button>
          <Button
            disabled={
              credentialMutation.isPending ||
              !query.data?.secrets.ingest.configured
            }
            onClick={() =>
              credentialMutation.mutate({ action: 'clear_ingest' })
            }
            variant="ghost"
          >
            {t('clear_ingest')}
          </Button>
          {issuedSecret ? (
            <div className="border p-3">
              <p className="text-muted-foreground text-xs">{t('shown_once')}</p>
              <code className="mt-2 block break-all text-xs">
                {issuedSecret}
              </code>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="control-secret">{t('control_secret')}</Label>
            <Input
              id="control-secret"
              onChange={(event) => setControlSecret(event.target.value)}
              type="password"
              value={controlSecret}
            />
            <Button
              disabled={
                credentialMutation.isPending ||
                !query.data?.secrets.ingest.configured ||
                controlSecret.length < 24
              }
              onClick={() =>
                credentialMutation.mutate({
                  action: 'set_control',
                  secret: controlSecret,
                })
              }
              variant="outline"
            >
              {t('save_control')}
            </Button>
            <Button
              disabled={
                credentialMutation.isPending ||
                !query.data?.secrets.control.configured
              }
              onClick={() =>
                credentialMutation.mutate({ action: 'clear_control' })
              }
              variant="ghost"
            >
              {t('clear_control')}
            </Button>
          </div>
          <div className="space-y-2 border-t pt-4">
            <p className="text-muted-foreground text-xs">
              {t('pair_description')}
            </p>
            <Button
              disabled={
                credentialMutation.isPending ||
                !issuedSecret ||
                !query.data?.secrets.control.configured
              }
              onClick={() => {
                if (!issuedSecret) return;
                credentialMutation.mutate({
                  action: 'pair',
                  ingestSecret: issuedSecret,
                });
              }}
              variant="outline"
            >
              {t('pair')}
            </Button>
          </div>
          <Button
            disabled={
              credentialMutation.isPending ||
              !query.data?.secrets.control.configured
            }
            onClick={() => credentialMutation.mutate({ action: 'verify' })}
            variant="outline"
          >
            <RefreshCw className="size-4" />
            {t('verify')}
          </Button>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div>
          <h2 className="font-medium">{t('widget')}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('widget_description')}
          </p>
          <div className="mt-3 flex items-start gap-2 border p-3">
            <code className="min-w-0 flex-1 break-all text-xs">
              {widgetSnippet}
            </code>
            <Button
              aria-label={t('copy')}
              onClick={() => navigator.clipboard?.writeText(widgetSnippet)}
              size="icon"
              variant="ghost"
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
        <div>
          <h2 className="font-medium">{t('inbox')}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('inbox_description')}
          </p>
          <Button asChild className="mt-3" variant="outline">
            <a href={`/${locale}/${wsId}/chat/inbox?scope=external`}>
              <MessageSquare className="size-4" />
              {t('open_inbox')}
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}

function isAuthorityMode(
  value: unknown
): value is
  | 'legacy_primary'
  | 'mirror_verified'
  | 'tuturuuu_primary'
  | 'fallback_queue'
  | 'paused' {
  return (
    typeof value === 'string' &&
    [
      'legacy_primary',
      'mirror_verified',
      'tuturuuu_primary',
      'fallback_queue',
      'paused',
    ].includes(value)
  );
}

function SecretRow({
  configured,
  label,
  lastFour,
}: {
  configured: boolean;
  label: string;
  lastFour?: string | null;
}) {
  const t = useTranslations('connected-chat');
  return (
    <div className="flex items-center justify-between border-b pb-3 text-sm">
      <span>{label}</span>
      <span className="text-muted-foreground">
        {configured ? `•••• ${lastFour ?? ''}` : t('not_configured')}
      </span>
    </div>
  );
}
