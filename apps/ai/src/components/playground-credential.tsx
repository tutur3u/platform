'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Zap,
} from '@tuturuuu/icons';
import type { AiStudioPublicModel } from '@tuturuuu/internal-api/ai-studio';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AI_STUDIO_BASE_URL } from './developer-docs/snippets';
import { SectionCard } from './studio/section-card';

export function PlaygroundCredential({
  approvalGranted,
  canManageAiKeys,
  isApprovalLoading,
  models,
  onCreateKey,
  onSecretChange,
  onVerify,
  secret,
  verifyState,
  workspaceId,
}: {
  approvalGranted: boolean;
  canManageAiKeys: boolean;
  isApprovalLoading: boolean;
  models: AiStudioPublicModel[];
  onCreateKey: () => void;
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

  return (
    <SectionCard
      actions={
        verifyState.isSuccess ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-dynamic-green/10 px-2 py-0.5 font-medium text-dynamic-green text-xs ring-1 ring-dynamic-green/25 ring-inset">
            <CheckCircle2 className="size-3" />
            {t('key_verified', { count: models.length })}
          </span>
        ) : null
      }
      description={t('credential_description')}
      icon={KeyRound}
      title={t('credential_title')}
    >
      <div className="flex gap-2">
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

      <div className="mt-3 flex flex-wrap gap-2">
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

      {canManageAiKeys && !isApprovalLoading && !approvalGranted ? (
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
