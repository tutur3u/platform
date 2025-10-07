'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { Button } from '@tuturuuu/ui/button';
import { useCopyToClipboard } from '@tuturuuu/ui/hooks/use-copy-to-clipboard';
import { CheckIcon, CopyIcon } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import type React from 'react';

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
    const content = stripFollowUp(
      message.parts[0]?.type === 'text' ? message.parts[0].text : ''
    );
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
