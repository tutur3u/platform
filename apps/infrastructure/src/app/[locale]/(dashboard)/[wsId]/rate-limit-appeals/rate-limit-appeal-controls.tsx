'use client';

import { Check, Loader2, ShieldCheck, X } from '@tuturuuu/icons';
import type {
  RateLimitActionPresetKey,
  RateLimitAppeal,
  RateLimitRecommendedAction,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export interface ApproveAppealPayload {
  allowWorkspaceMismatch?: boolean;
  appealId: string;
  createWorkspaceRule?: boolean;
  expiresInDays?: number;
  presetKey?: RateLimitActionPresetKey;
  reviewNote?: string;
  trustMultiplier?: number;
  workspaceId?: string | null;
}

export interface ReviewAppealPayload {
  appealId: string;
  reviewNote?: string;
}

function getAppealActionText(
  action: RateLimitRecommendedAction,
  t: ReturnType<typeof useTranslations>
) {
  switch (action.key) {
    case 'clear_ip_only':
      return {
        description: t('presets.clear_ip_only.description'),
        label: t('presets.clear_ip_only.label'),
      };
    case 'event_or_classroom':
      return {
        description: t('presets.event_or_classroom.description'),
        label: t('presets.event_or_classroom.label'),
      };
    case 'extended_trusted':
      return {
        description: t('presets.extended_trusted.description'),
        label: t('presets.extended_trusted.label'),
      };
    case 'trusted_workspace':
      return {
        description: t('presets.trusted_workspace.description'),
        label: t('presets.trusted_workspace.label'),
      };
    default:
      return {
        description: action.description,
        label: action.label,
      };
  }
}

export function AppealReviewControls({
  appeal,
  canManage,
  isWorking,
  onApprove,
  onClose,
  onReject,
}: {
  appeal: RateLimitAppeal;
  canManage: boolean;
  isWorking: boolean;
  onApprove: (payload: ApproveAppealPayload) => void;
  onClose: (payload: ReviewAppealPayload) => void;
  onReject: (payload: ReviewAppealPayload) => void;
}) {
  const t = useTranslations('rate-limit-appeals');
  const actions = appeal.reviewContext?.recommendedActions ?? [];
  const defaultAction = useMemo(
    () =>
      actions.find((action) => action.recommended) ??
      actions.find((action) => action.key === 'trusted_workspace') ??
      actions[0],
    [actions]
  );
  const [selectedKey, setSelectedKey] = useState<RateLimitActionPresetKey>(
    defaultAction?.key ?? 'trusted_workspace'
  );
  const [workspaceId, setWorkspaceId] = useState(appeal.workspace_id ?? '');
  const [allowWorkspaceMismatch, setAllowWorkspaceMismatch] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  if (!canManage) {
    return null;
  }

  const selectedAction =
    actions.find((action) => action.key === selectedKey) ?? defaultAction;
  const needsWorkspace = selectedAction?.createWorkspaceRule ?? false;
  const requiresOverride = selectedAction?.requiresAdvancedOverride ?? false;
  const canApprove =
    appeal.status === 'pending' &&
    !!selectedAction &&
    (!needsWorkspace || workspaceId.trim().length > 0) &&
    (!requiresOverride || allowWorkspaceMismatch);

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="font-medium">{t('review.title')}</p>
        <p className="text-muted-foreground text-sm">
          {t('review.description')}
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {actions.map((action) => {
          const actionText = getAppealActionText(action, t);

          return (
            <button
              className={`rounded-md border p-3 text-left transition hover:bg-muted/60 ${
                selectedKey === action.key
                  ? 'border-primary bg-muted'
                  : 'border-border'
              }`}
              key={action.key}
              onClick={() => setSelectedKey(action.key)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{actionText.label}</span>
                {action.recommended ? (
                  <Badge variant="secondary">{t('review.recommended')}</Badge>
                ) : null}
              </div>
              <span className="mt-1 block text-muted-foreground text-xs">
                {actionText.description}
              </span>
              {action.disabledReason ? (
                <span className="mt-2 block text-dynamic-yellow text-xs">
                  {action.disabledReason}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {needsWorkspace ? (
        <div className="space-y-2">
          <Label htmlFor={`appeal-${appeal.id}-workspace`}>
            {t('fields.workspace')}
          </Label>
          <Input
            id={`appeal-${appeal.id}-workspace`}
            onChange={(event) => setWorkspaceId(event.target.value)}
            placeholder={t('fields.workspace_placeholder')}
            value={workspaceId}
          />
        </div>
      ) : null}

      {requiresOverride ? (
        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <Checkbox
            checked={allowWorkspaceMismatch}
            onCheckedChange={(checked) => setAllowWorkspaceMismatch(!!checked)}
          />
          <span>
            <span className="block font-medium">
              {t('review.allow_mismatch')}
            </span>
            <span className="block text-muted-foreground">
              {t('review.allow_mismatch_description')}
            </span>
          </span>
        </label>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`appeal-${appeal.id}-note`}>
          {t('fields.review_note')}
        </Label>
        <Textarea
          id={`appeal-${appeal.id}-note`}
          onChange={(event) => setReviewNote(event.target.value)}
          placeholder={t('fields.review_note_placeholder')}
          value={reviewNote}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canApprove || isWorking}
          onClick={() =>
            selectedAction &&
            onApprove({
              allowWorkspaceMismatch,
              appealId: appeal.id,
              createWorkspaceRule: selectedAction.createWorkspaceRule,
              expiresInDays: selectedAction.expiresInDays ?? undefined,
              presetKey: selectedAction.key,
              reviewNote: reviewNote.trim() || undefined,
              trustMultiplier: selectedAction.trustMultiplier ?? undefined,
              workspaceId: workspaceId.trim() || null,
            })
          }
          type="button"
        >
          {isWorking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {t('actions.approve')}
        </Button>
        <Button
          disabled={appeal.status !== 'pending' || isWorking}
          onClick={() =>
            onReject({
              appealId: appeal.id,
              reviewNote: reviewNote.trim() || undefined,
            })
          }
          type="button"
          variant="destructive"
        >
          <X className="h-4 w-4" />
          {t('actions.reject')}
        </Button>
        <Button
          disabled={isWorking}
          onClick={() =>
            onClose({
              appealId: appeal.id,
              reviewNote: reviewNote.trim() || undefined,
            })
          }
          type="button"
          variant="outline"
        >
          <Check className="h-4 w-4" />
          {t('actions.close')}
        </Button>
      </div>
    </div>
  );
}
