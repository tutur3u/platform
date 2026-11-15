import type { Message, ThreadInfo } from '@tuturuuu/ai/chat-sdk';

export type ZaloPersonalWebSyncStatus =
  | 'completed'
  | 'failed'
  | 'partial'
  | 'waiting_for_phone';

export interface ZaloPersonalWebSyncMessage {
  authorId: string;
  authorName: string;
  id: string;
  isSelf: boolean;
  text: string;
  threadId: string;
  threadTitle: string;
  threadType: 'group' | 'user';
  timestamp: number;
}

export interface ZaloPersonalWebSyncResult {
  approvalRequested: boolean;
  conversations: number;
  error: string | null;
  groupMessages: number;
  messages: Message<ZaloPersonalWebSyncMessage>[];
  missingRanges: number;
  requestAccepted: boolean;
  status: ZaloPersonalWebSyncStatus;
  threads: ThreadInfo[];
  userMessages: number;
}

export interface ZaloPersonalWebSyncOptions {
  agentId: string;
  channelDisplayName: string;
  channelId: string;
  cookieJson: string;
  imei: string;
  ownId?: string | null;
  userAgent: string;
  maxConversations?: number;
  maxMessagesPerConversation?: number;
  syncTimeoutMs?: number;
}
