import type { UIMessage } from '@tuturuuu/ai/types';
import type { RefObject } from 'react';
import type { MessageFileAttachment } from '../file-preview-chips';

export interface ChatMessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  assistantName?: string;
  userName?: string;
  userAvatarUrl?: string | null;
  onAutoSubmitMermaidFix?: (prompt: string) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  toolbarVisibilityAnchorRef?: RefObject<HTMLDivElement | null>;
  messageAttachments?: Map<string, MessageFileAttachment[]>;
}

type ToolMessagePart = UIMessage['parts'][number];

export type ToolPartData =
  | Extract<ToolMessagePart, { type: 'dynamic-tool' }>
  | Extract<ToolMessagePart, { type: `tool-${string}` }>;

export type JsonObject = Record<string, unknown>;

export type ApprovalRequestUiData = {
  startTime: string;
  endTime: string;
  titleHint?: string | null;
  descriptionHint?: string | null;
};

export type RenderGroup =
  | { kind: 'text'; text: string; index: number }
  | { kind: 'reasoning'; text: string; index: number }
  | {
      kind: 'tool';
      toolName: string;
      parts: ToolPartData[];
      startIndex: number;
    }
  | { kind: 'other'; index: number };
