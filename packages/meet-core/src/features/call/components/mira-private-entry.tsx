'use client';

import { Lock } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { LiveSessionSnapshot } from '../../live-assistant/live-session-store';
import { LiveVoiceSelect } from '../../live-assistant/live-voice-select';

/**
 * The header control's way into the Private Assistant: it opens that
 * assistant's consent dialog, and sets Mira's voice before a session starts.
 */
export function MiraPrivateEntry({
  session,
  onOpen,
  compact = false,
}: {
  session: LiveSessionSnapshot;
  onOpen: () => void;
  compact?: boolean;
}) {
  const t = useTranslations('meet.live');
  const live = !['idle', 'error', 'ended'].includes(session.status);
  return (
    <div
      className={
        compact
          ? 'space-y-2'
          : 'space-y-2 border-t pt-2 first:border-t-0 first:pt-0'
      }
    >
      <Button
        type="button"
        size="sm"
        variant={compact ? 'default' : 'outline'}
        className={
          compact
            ? 'w-full justify-start pointer-coarse:h-11'
            : 'w-full justify-start'
        }
        onClick={onOpen}
      >
        <Lock aria-hidden className="size-4" />
        {t('open_private')}
      </Button>
      <LiveVoiceSelect locked={live} compact={compact} />
    </div>
  );
}
