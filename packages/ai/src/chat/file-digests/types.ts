import type { ChatAttachmentMetadata } from '../chat-attachment-metadata';

export type ChatFileDigestDbRow = {
  answer_context_markdown: string | null;
  chat_id: string;
  created_at: string;
  digest_version: number;
  display_name: string;
  error_message: string | null;
  extracted_markdown: string | null;
  file_name: string;
  file_size: number | null;
  id: string;
  limitations: unknown;
  media_type: string;
  message_id: string | null;
  processor_model: string;
  status: 'failed' | 'processing' | 'ready';
  storage_path: string;
  structured: unknown;
  suggested_alias: string | null;
  summary: string | null;
  title: string | null;
  updated_at: string;
  ws_id: string;
};

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
