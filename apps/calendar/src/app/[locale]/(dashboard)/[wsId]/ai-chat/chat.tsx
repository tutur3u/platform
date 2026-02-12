'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import type { AIChat } from '@tuturuuu/types';
import { cn } from '@tuturuuu/utils/format';
import type React from 'react';

export interface ChatProps extends React.ComponentProps<'div'> {
  defaultChat?: Partial<AIChat>;
  wsId?: string;
  initialMessages?: UIMessage[];
  chats?: AIChat[];
  count?: number | null;
  hasKeys?: { openAI: boolean; anthropic: boolean; google: boolean };
  locale?: string;
  disableScrollToTop?: boolean;
  disableScrollToBottom?: boolean;
}

// Stub: AI Chat is not yet available in the standalone calendar app.
// The full chat component lives in apps/web and depends on web-only components.
export default function Chat({ className, ...props }: ChatProps) {
  return (
    <div
      className={cn(
        'flex h-full items-center justify-center text-muted-foreground',
        className
      )}
      {...props}
    >
      <p className="text-center text-sm">
        AI Chat is not yet available in the calendar app.
      </p>
    </div>
  );
}
