'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Zap,
} from '@tuturuuu/icons';
import type {
  AiStudioApiKey,
  AiStudioPublicModel,
} from '@tuturuuu/internal-api/ai-studio';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AI_STUDIO_BASE_URL } from './developer-docs/snippets';
import { SectionCard } from './studio/section-card';

export function PlaygroundCredential({
  approvalGranted,
  canManageAiKeys,
  credentialError,
  credentialValue,
  isCredentialLoading,
  keys,
  models,
  onCreateKey,
  onCredentialChange,
  onSecretChange,
  onVerify,
  secret,
  verifyState,
  workspaceId,
}: {
  approvalGranted: boolean;
  canManageAiKeys: boolean;
  credentialError: Error | null;
  credentialValue: string;
  isCredentialLoading: boolean;
  keys: AiStudioApiKey[];
  models: AiStudioPublicModel[];
  onCreateKey: () => void;
  onCredentialChange: (value: string) => void;
  onSecretChange: (value: string) => void;
  onVerify: () => void;
  secret: string;
  verifyState: Pick<
    UseMutationResult<unknown, Error, string>,
    'isPending' | 'isSuccess'
  >;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.playground_console');
  const [showSecret, setShowSecret] = useState(false);
  const activeKeys = keys.filter(isActiveKey);
  const selectedValue =
    credentialValue === 'saved:auto'
      ? activeKeys[0]
        ? `saved:${activeKeys[0].id}`
        : 'manual'
      : credentialValue;
  const usingSavedKey = selectedValue.startsWith('saved:');

  return (
    <SectionCard
      actions={
        (usingSavedKey && models.length) || verifyState.isSuccess ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-dynamic-green/10 px-2 py-0.5 font-medium text-dynamic-green text-xs ring-1 ring-dynamic-green/25 ring-inset">
            <CheckCircle2 className="size-3" />
            {usingSavedKey
              ? t('saved_key_ready', { count: models.length })
              : t('key_verified', { count: models.length })}
          </span>
        ) : isCredentialLoading ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
            <Loader2 className="size-3 animate-spin" />
            {t('loading_credential')}
          </span>
        ) : null
      }
      description={t('credential_description_saved')}
      icon={KeyRound}
      title={t('credential_title')}
    >
      {canManageAiKeys ? (
        <div className="space-y-2">
          <span className="font-medium text-xs">{t('credential_source')}</span>
          <Select onValueChange={onCredentialChange} value={selectedValue}>
            <SelectTrigger className="h-auto min-h-10 py-2">
              <SelectValue placeholder={t('select_saved_key')} />
            </SelectTrigger>
            <SelectContent>
              {keys.map((key) => (
                <SelectItem
                  disabled={!isActiveKey(key)}
                  key={key.id}
                  value={`saved:${key.id}`}
                >
                  {key.name} · {key.prefix} ·{' '}
                  {isActiveKey(key)
                    ? key.environment
                    : key.revoked_at
                      ? t('key_revoked')
                      : t('key_expired')}
                </SelectItem>
              ))}
              {keys.length ? <SelectSeparator /> : null}
              <SelectItem value="manual">{t('paste_another_key')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {!usingSavedKey ? (
        <div className="mt-3 flex gap-2">
          <Input
            aria-label={t('api_key')}
            autoComplete="off"
            className="font-mono"
            onChange={(event) => onSecretChange(event.target.value)}
            placeholder="ttr_ai_…"
            type={showSecret ? 'text' : 'password'}
            value={secret}
          />
          <Button
            aria-label={showSecret ? t('hide_key') : t('show_key')}
            onClick={() => setShowSecret((value) => !value)}
            size="icon"
            type="button"
            variant="outline"
          >
            {showSecret ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
          <Button
            aria-label={t('copy_key')}
            disabled={!secret}
            onClick={async () => {
              await navigator.clipboard.writeText(secret);
              toast.success(t('key_copied'));
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <Copy className="size-4" />
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!usingSavedKey ? (
          <Button
            disabled={!secret || verifyState.isPending}
            onClick={onVerify}
            size="sm"
            type="button"
            variant="outline"
          >
            <CheckCircle2 className="mr-2 size-3.5" />
            {t('verify_key')}
          </Button>
        ) : null}
        {canManageAiKeys && approvalGranted ? (
          <Button onClick={onCreateKey} size="sm" type="button">
            <Zap className="mr-2 size-3.5" />
            {t('quick_create')}
          </Button>
        ) : null}
        {canManageAiKeys ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/${workspaceId}/api-keys`}>{t('manage_keys')}</Link>
          </Button>
        ) : null}
      </div>

      {credentialError ? (
        <div className="mt-3 flex gap-2 rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-3 text-dynamic-red text-xs">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{credentialError.message}</span>
        </div>
      ) : null}

      {canManageAiKeys && !isCredentialLoading && !approvalGranted ? (
        <p className="mt-3 rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
          {t('approval_required')}
        </p>
      ) : null}

      <p className="mt-3 font-mono text-muted-foreground text-xs">
        {AI_STUDIO_BASE_URL}
      </p>
    </SectionCard>
  );
}

function isActiveKey(key: AiStudioApiKey) {
  return (
    !key.revoked_at &&
    (!key.expires_at || new Date(key.expires_at).getTime() > Date.now())
  );
}
