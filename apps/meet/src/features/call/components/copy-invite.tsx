'use client';

import { Check, Link2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { buildJoinUrl, encodeRoomCode } from '../lib/room-code';

/**
 * Copies the joining link and the human-readable code together, so a pasted
 * invite works whether the recipient clicks it or types the code.
 */
export function CopyInvite({
  meetingId,
  meetingName,
}: {
  meetingId: string;
  meetingName: string;
}) {
  const t = useTranslations('meet.call');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const origin = window.location.origin;
    const code = encodeRoomCode(meetingId);
    await navigator.clipboard.writeText(
      `${meetingName}\n${buildJoinUrl(origin, meetingId)}\n${t('meeting_code')}: ${code}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="h-8 gap-1.5 text-xs"
          onClick={() => void copy()}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied ? (
            <Check className="size-3.5 text-dynamic-green" />
          ) : (
            <Link2 className="size-3.5" />
          )}
          {copied ? t('copied') : t('copy_invite')}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('copy_invite_hint')}</TooltipContent>
    </Tooltip>
  );
}
