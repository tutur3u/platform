'use client';

import { LockKeyhole } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { MiraWorkspaceOff } from '../../live-assistant/mira-workspace-off';
import { MiraAvatar } from './mira-profile';

export type AssistantFailureNotice =
  | 'workspace_off'
  | 'room_unavailable'
  | 'consent_pending'
  | 'failed';

/**
 * Why room @mira did not answer. The workspace code means its owner has not
 * declared an 18+ audience; the consent code means not everyone has chosen
 * Continue yet; any other 403 is room Mira being unavailable.
 */
export function assistantFailureNotice(error: unknown): AssistantFailureNotice {
  if (!error || typeof error !== 'object') return 'failed';
  const code = 'code' in error ? error.code : undefined;
  if (code === 'MIRA_ROOM_CONSENT_REQUIRED') return 'consent_pending';
  if (code === 'MIRA_WORKSPACE_UNAVAILABLE') return 'workspace_off';
  return 'status' in error && error.status === 403
    ? 'room_unavailable'
    : 'failed';
}

/** The room chat message shown when @mira could not answer. */
export function ChatAssistantNotice({
  notice,
  wsId,
  onOpenPrivateMira,
}: {
  notice: AssistantFailureNotice;
  wsId?: string;
  onOpenPrivateMira?: () => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm"
    >
      <MiraAvatar size={20} />
      {notice === 'workspace_off' ? (
        <MiraWorkspaceOff wsId={wsId} className="min-w-0 flex-1" />
      ) : (
        <p className="min-w-0 flex-1">
          {t(
            notice === 'room_unavailable'
              ? 'assistant_private_only'
              : notice === 'consent_pending'
                ? 'assistant_consent_pending'
                : 'assistant_failed'
          )}
        </p>
      )}
      {notice === 'room_unavailable' && onOpenPrivateMira && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenPrivateMira}
        >
          <LockKeyhole className="size-4" />
          {t('personal_chat')}
        </Button>
      )}
    </div>
  );
}
