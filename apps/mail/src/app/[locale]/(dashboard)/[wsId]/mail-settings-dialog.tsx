'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Mail, Route, Tag, Users } from '@tuturuuu/icons';
import {
  getMailCatchAllConfiguration,
  getMailMailboxSettings,
  listMailDomains,
  listMailMailboxMembers,
  type MailMailbox,
  updateMailCatchAllConfiguration,
  updateMailMailboxSettings,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { Dialog } from '@tuturuuu/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { MailLabelSettings } from './mail-label-settings';
import { MailSignaturePreview } from './mail-signature-preview';

export function MailSettingsDialog({
  mailbox,
  onOpenChange,
  open,
  workspaceId,
}: {
  mailbox: MailMailbox | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('identity');
  const [senderName, setSenderName] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [signatureHtml, setSignatureHtml] = useState('');
  const [outboundProvider, setOutboundProvider] = useState('default');
  const [aiInstructions, setAiInstructions] = useState('');
  const [autoDraftEnabled, setAutoDraftEnabled] = useState(false);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [targetMailboxId, setTargetMailboxId] = useState<string | null>(null);
  const [catchAllEnabled, setCatchAllEnabled] = useState(false);
  const [catchAllAutoDraft, setCatchAllAutoDraft] = useState(false);
  const usesManagedIdentity = mailbox?.type === 'personal';

  const settingsQuery = useQuery({
    enabled: open && Boolean(mailbox),
    queryFn: () => getMailMailboxSettings(workspaceId, mailbox?.id ?? ''),
    queryKey: ['mail', workspaceId, mailbox?.id, 'settings'],
  });
  const membersQuery = useQuery({
    enabled: open && Boolean(mailbox) && tab === 'members',
    queryFn: () => listMailMailboxMembers(workspaceId, mailbox?.id ?? ''),
    queryKey: ['mail', workspaceId, mailbox?.id, 'members'],
  });
  const domainsQuery = useQuery({
    enabled: open,
    queryFn: () => listMailDomains(),
    queryKey: ['mail', 'operator-domains'],
    retry: false,
  });
  const catchAllQuery = useQuery({
    enabled: open && Boolean(domainId) && tab === 'delivery',
    queryFn: () => getMailCatchAllConfiguration(domainId ?? ''),
    queryKey: ['mail', 'catch-all', domainId],
    retry: false,
  });

  useEffect(() => {
    const settings = settingsQuery.data?.settings;
    if (!settings) return;
    setSenderName(settings.senderName);
    setSignatureText(settings.signatureText ?? '');
    setSignatureHtml(settings.signatureHtml ?? '');
    setOutboundProvider(settings.outboundProviderOverride ?? 'default');
    setAiInstructions(settings.aiInstructions);
    setAutoDraftEnabled(settings.autoDraftEnabled);
  }, [settingsQuery.data]);
  useEffect(() => {
    if (domainId || !domainsQuery.data?.domains.length) return;
    const pilot =
      domainsQuery.data.domains.find(
        (domain) => domain.domain === 'ingest.tutur3u.com'
      ) ?? domainsQuery.data.domains[0];
    setDomainId(pilot?.id ?? null);
  }, [domainId, domainsQuery.data]);
  useEffect(() => {
    if (!catchAllQuery.data) return;
    setTargetMailboxId(catchAllQuery.data.targetMailboxId);
    setCatchAllEnabled(catchAllQuery.data.enabled);
    setCatchAllAutoDraft(catchAllQuery.data.autoDraftEnabled);
  }, [catchAllQuery.data]);

  const saveSettings = useMutation({
    mutationFn: () =>
      updateMailMailboxSettings(workspaceId, mailbox?.id ?? '', {
        aiInstructions,
        autoDraftEnabled,
        outboundProviderOverride:
          outboundProvider === 'default'
            ? null
            : (outboundProvider as 'cloudflare' | 'ses'),
        ...(usesManagedIdentity ? {} : { senderName }),
        signatureHtml: signatureHtml || null,
        signatureText: signatureText || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mail', workspaceId] });
    },
  });
  const saveCatchAll = useMutation({
    mutationFn: () =>
      updateMailCatchAllConfiguration(domainId ?? '', {
        autoDraftEnabled: catchAllAutoDraft,
        enabled: catchAllEnabled,
        targetMailboxId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mail', 'catch-all', domainId],
      });
    },
  });

  const operator = Boolean(domainsQuery.data?.domains);
  const settings = settingsQuery.data?.settings;
  const settingsDirty = Boolean(
    settings &&
      (senderName !== settings.senderName ||
        signatureText !== (settings.signatureText ?? '') ||
        signatureHtml !== (settings.signatureHtml ?? '') ||
        outboundProvider !== (settings.outboundProviderOverride ?? 'default') ||
        aiInstructions !== settings.aiInstructions ||
        autoDraftEnabled !== settings.autoDraftEnabled)
  );
  const catchAllDirty = Boolean(
    catchAllQuery.data &&
      (targetMailboxId !== catchAllQuery.data.targetMailboxId ||
        catchAllEnabled !== catchAllQuery.data.enabled ||
        catchAllAutoDraft !== catchAllQuery.data.autoDraftEnabled)
  );
  const navItems = useMemo(
    () => [
      {
        items: [
          {
            description: t('identity_description'),
            icon: Mail,
            label: t('identity'),
            name: 'identity',
          },
          {
            description: t('automation_description'),
            icon: Bot,
            label: t('automation'),
            name: 'automation',
          },
          {
            description: t('labels_settings_description'),
            icon: Tag,
            label: t('labels'),
            name: 'labels',
          },
          {
            description: t('members_description'),
            icon: Users,
            label: t('members'),
            name: 'members',
          },
          {
            description: t('delivery_description'),
            disabled: !operator,
            icon: Route,
            label: t('delivery'),
            name: 'delivery',
          },
        ],
        label: t('title'),
      },
    ],
    [operator, t]
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <SettingsDialogShell
        activeTab={tab}
        keyboardNavigation
        navItems={navItems}
        onActiveTabChange={setTab}
      >
        <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
          {tab === 'identity' ? (
            <>
              <SettingField
                description={
                  usesManagedIdentity ? t('sender_name_managed') : undefined
                }
                label={t('sender_name')}
              >
                <Input
                  className="outline-none focus-visible:outline-none focus-visible:ring-0"
                  disabled={usesManagedIdentity}
                  onChange={(event) => setSenderName(event.target.value)}
                  readOnly={usesManagedIdentity}
                  value={senderName}
                />
              </SettingField>
              <SettingField
                description={t('signature_description')}
                label={t('signature')}
              >
                <Tabs defaultValue="plain">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="plain">
                      {t('signature_plain_text')}
                    </TabsTrigger>
                    <TabsTrigger value="html">
                      {t('signature_html')}
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      {t('signature_preview')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="plain">
                    <Textarea
                      className="min-h-40 resize-y outline-none focus-visible:outline-none focus-visible:ring-0"
                      onChange={(event) => setSignatureText(event.target.value)}
                      placeholder={t('signature_plain_text_placeholder')}
                      value={signatureText}
                    />
                  </TabsContent>
                  <TabsContent value="html">
                    <Textarea
                      className="min-h-40 resize-y font-mono text-xs outline-none focus-visible:outline-none focus-visible:ring-0"
                      onChange={(event) => setSignatureHtml(event.target.value)}
                      placeholder={t('signature_html_placeholder')}
                      value={signatureHtml}
                    />
                  </TabsContent>
                  <TabsContent value="preview">
                    <MailSignaturePreview
                      emptyLabel={t('signature_preview_empty')}
                      html={signatureHtml}
                      text={signatureText}
                      title={t('signature_preview_title')}
                    />
                  </TabsContent>
                </Tabs>
              </SettingField>
              <SettingField label={t('outbound_provider')}>
                <Select
                  onValueChange={setOutboundProvider}
                  value={outboundProvider}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      {t('domain_default')}
                    </SelectItem>
                    <SelectItem value="cloudflare">Cloudflare</SelectItem>
                    <SelectItem value="ses">AWS SES</SelectItem>
                  </SelectContent>
                </Select>
              </SettingField>
              <div className="flex justify-end">
                <Button
                  disabled={saveSettings.isPending || !settingsDirty}
                  onClick={() => saveSettings.mutate()}
                >
                  {t('save')}
                </Button>
              </div>
            </>
          ) : null}
          {tab === 'automation' ? (
            <>
              <SettingField label={t('ai_instructions')}>
                <Textarea
                  className="min-h-44 outline-none focus-visible:outline-none focus-visible:ring-0"
                  onChange={(event) => setAiInstructions(event.target.value)}
                  value={aiInstructions}
                />
              </SettingField>
              <ToggleRow
                checked={autoDraftEnabled}
                description={t('auto_draft_description')}
                label={t('automatic_drafts')}
                onCheckedChange={setAutoDraftEnabled}
              />
              <p className="text-muted-foreground text-xs">
                {t('drafts_never_send')}
              </p>
              <div className="flex justify-end">
                <Button
                  disabled={saveSettings.isPending || !settingsDirty}
                  onClick={() => saveSettings.mutate()}
                >
                  {t('save')}
                </Button>
              </div>
            </>
          ) : null}
          {tab === 'labels' && mailbox ? (
            <MailLabelSettings
              canManage={mailbox.role === 'owner' || mailbox.role === 'admin'}
              mailboxId={mailbox.id}
              workspaceId={workspaceId}
            />
          ) : null}
          {tab === 'members' ? (
            <div className="divide-y divide-dynamic overflow-hidden rounded-2xl border border-dynamic">
              {(membersQuery.data?.members ?? []).map((member) => (
                <div
                  className="flex items-center gap-3 p-4"
                  key={member.userId}
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-foreground/[0.05] font-semibold text-xs">
                    {(member.fullName || member.email || '?')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-sm">
                      {member.fullName || member.email}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {member.email}
                    </div>
                  </div>
                  <span className="rounded-full bg-foreground/[0.05] px-2 py-1 text-xs capitalize">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {tab === 'delivery' && operator ? (
            <>
              <SettingField label={t('managed_domain')}>
                <Select
                  onValueChange={setDomainId}
                  value={domainId ?? undefined}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {domainsQuery.data?.domains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingField>
              <SettingField label={t('catch_all_mailbox')}>
                <Select
                  onValueChange={setTargetMailboxId}
                  value={targetMailboxId ?? undefined}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('select_mailbox')} />
                  </SelectTrigger>
                  <SelectContent>
                    {catchAllQuery.data?.eligibleMailboxes.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.displayName} · {candidate.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingField>
              <ToggleRow
                checked={catchAllEnabled}
                description={t('catch_all_description')}
                label={t('enable_catch_all')}
                onCheckedChange={(enabled) => {
                  setCatchAllEnabled(enabled);
                  if (!enabled) setCatchAllAutoDraft(false);
                }}
              />
              <ToggleRow
                checked={catchAllAutoDraft}
                description={t('catch_all_auto_draft_description')}
                disabled={!catchAllEnabled}
                label={t('catch_all_auto_drafts')}
                onCheckedChange={setCatchAllAutoDraft}
              />
              <div className="flex justify-end">
                <Button
                  disabled={
                    saveCatchAll.isPending ||
                    !catchAllDirty ||
                    (catchAllEnabled && !targetMailboxId)
                  }
                  onClick={() => saveCatchAll.mutate()}
                >
                  {t('save')}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </SettingsDialogShell>
    </Dialog>
  );
}

function SettingField({
  children,
  description,
  label,
}: {
  children: React.ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
      {description ? (
        <p className="text-muted-foreground text-xs leading-5">{description}</p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-dynamic p-4">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm">{label}</div>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
