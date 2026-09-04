'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { ExternalProjectEmailPolicy } from '@/lib/external-projects/email-policy';

type Props = {
  canUseRootCredentials: boolean;
  initialPolicy: ExternalProjectEmailPolicy;
  wsId: string;
};

function parseDomains(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/u)
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export default function ExternalEmailPolicy({
  canUseRootCredentials,
  initialPolicy,
  wsId,
}: Props) {
  const t = useTranslations('ws-settings.email_policy');
  const [enabled, setEnabled] = useState(initialPolicy.enabled);
  const [domainsValue, setDomainsValue] = useState(
    initialPolicy.allowedRecipientDomains.join('\n')
  );
  const [useRootCredentials, setUseRootCredentials] = useState(
    initialPolicy.useRootWorkspaceCredentials
  );
  const [saving, setSaving] = useState(false);
  const domains = useMemo(() => parseDomains(domainsValue), [domainsValue]);
  const canSave = !enabled || domains.length > 0;

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${encodeURIComponent(wsId)}/external-projects/email-policy`,
        {
          body: JSON.stringify({
            allowedRecipientDomains: domains,
            enabled,
            useRootWorkspaceCredentials: useRootCredentials,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        }
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || t('save_error'));
      }
      toast({ title: t('saved') });
    } catch (error) {
      toast({
        color: 'red',
        title: error instanceof Error ? error.message : t('save_error'),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col rounded-lg border border-border bg-foreground/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-bold text-2xl text-foreground">{t('title')}</div>
          <p className="mt-2 max-w-2xl text-foreground/70 text-sm">
            {t('description')}
          </p>
        </div>
        <Badge variant={enabled ? 'default' : 'secondary'}>
          {enabled ? t('enabled_badge') : t('blocked_badge')}
        </Badge>
      </div>

      <div className="mt-6 space-y-5">
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-background p-4">
          <div>
            <Label htmlFor="external-email-enabled">{t('enable_label')}</Label>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('enable_description')}
            </p>
          </div>
          <Switch
            checked={enabled}
            id="external-email-enabled"
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="external-email-domains">{t('domains_label')}</Label>
          <Textarea
            aria-describedby="external-email-domains-help"
            className="min-h-28 font-mono text-sm"
            id="external-email-domains"
            onChange={(event) => setDomainsValue(event.target.value)}
            placeholder="example.com\ncompany.org"
            value={domainsValue}
          />
          <div
            className="flex flex-wrap items-center gap-2"
            id="external-email-domains-help"
          >
            <span className="text-muted-foreground text-xs">
              {t('domains_description')}
            </span>
            {domains.map((domain) => (
              <Badge key={domain} variant="outline">
                {domain}
              </Badge>
            ))}
          </div>
          {enabled && domains.length === 0 ? (
            <p className="text-dynamic-red text-sm">{t('domains_required')}</p>
          ) : null}
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border bg-background p-4">
          <div>
            <Label htmlFor="external-email-root-credentials">
              {t('shared_credentials_label')}
            </Label>
            <p className="mt-1 text-muted-foreground text-sm">
              {canUseRootCredentials
                ? t('shared_credentials_description')
                : t('shared_credentials_admin_only')}
            </p>
          </div>
          <Switch
            checked={useRootCredentials}
            disabled={!canUseRootCredentials}
            id="external-email-root-credentials"
            onCheckedChange={setUseRootCredentials}
          />
        </div>

        <div className="flex justify-end">
          <Button disabled={!canSave || saving} onClick={save}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </section>
  );
}
