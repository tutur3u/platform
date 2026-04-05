'use client';

import { getTextFromUIMessage } from '@ncthub/ai/chat/content';
import type { UIMessage } from '@ncthub/ai/types';
import { Button } from '@ncthub/ui/button';
import { CheckIcon, CopyIcon } from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import type React from 'react';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';

interface ChatMessageActionsProps extends React.ComponentProps<'div'> {
  message: UIMessage;
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
    const content = stripFollowUp(getTextFromUIMessage(message));
    copyToClipboard(content.trim());
  };

  return (
    <div className={cn('flex items-center justify-end', className)} {...props}>
      <Button variant="outline" size="icon" onClick={onCopy}>
        {isCopied ? <CheckIcon /> : <CopyIcon />}
        <span className="sr-only">Copy message</span>
      </Button>
    </div>
  );
}
