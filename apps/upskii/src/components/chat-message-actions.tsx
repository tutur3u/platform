'use client';

import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import { type Message } from '@tuturuuu/ai/types';
import { Button } from '@tuturuuu/ui/button';
import { IconCheck, IconCopy } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import React from 'react';

interface ChatMessageActionsProps extends React.ComponentProps<'div'> {
  message: Message;
}

export function ChatMessageActions({
  message,
  className,
  ...props
}: ChatMessageActionsProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });

  const stripFollowUp = (text: string) => {
    // Remove all text that follows the @<FOLLOWUP>...</FOLLOWUP> tag
    return text.replace(/@<FOLLOWUP>[\s\S]*<\/FOLLOWUP>/, '');
  };

  const onCopy = () => {
    if (isCopied) return;
    const content = stripFollowUp(message.content);
    copyToClipboard(content.trim());
  };

  return (
    <div className={cn('flex items-center justify-end', className)} {...props}>
      <Button variant="outline" size="icon" onClick={onCopy}>
        {isCopied ? <IconCheck /> : <IconCopy />}
        <span className="sr-only">Copy message</span>
      </Button>
    </div>
  );
}
