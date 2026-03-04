import type { Tables } from '@tuturuuu/types';
import type { ChatAttachmentMetadata } from '../chat-attachment-metadata';

export type ChatFileDigestDbRow = Tables<'ai_chat_file_digests'>;

export type ChatFileDigestStatus = 'ready' | 'failed';

export type ChatFileDigest = {
  digestVersion: number;
  storagePath: string;
  fileName: string;
  displayName: string;
  mediaType: string;
  status: ChatFileDigestStatus;
  title: string;
  summary: string;
  answerContextMarkdown: string;
  extractedMarkdown: string | null;
  keyFacts: string[];
  suggestedAlias: string | null;
  limitations: string[];
  processorModel: string;
};

export type ChatFileDigestUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export type EnsureChatFileDigestParams = {
  attachment: ChatAttachmentMetadata;
  chatId: string;
  creditWsId?: string | null;
  forceRefresh?: boolean;
  messageId?: string | null;
  userId: string;
  wsId: string;
};

export type EnsureChatFileDigestResult =
  | {
      ok: true;
      cached: boolean;
      digest: ChatFileDigest;
      usage?: ChatFileDigestUsage;
    }
  | {
      ok: false;
      cached: boolean;
      digest?: ChatFileDigest;
      error: string;
    };
