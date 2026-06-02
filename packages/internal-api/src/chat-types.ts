export type ChatConversationType = 'ai' | 'channel' | 'direct' | 'group';
export type ChatMessageKind = 'assistant' | 'system' | 'user';
export type ChatAiCreditSource = 'personal' | 'workspace';
export type ChatAiThinkingMode = 'fast' | 'thinking';

export interface ChatUserProfile {
  avatarUrl: string | null;
  displayName: string;
  handle: string | null;
  id: string;
}

export type ChatFriendRequestStatus = 'accepted' | 'declined' | 'pending';

export interface ChatFriendRequest {
  createdAt: string;
  id: string;
  recipient: ChatUserProfile;
  recipientUserId: string;
  requester: ChatUserProfile;
  requesterUserId: string;
  respondedAt: string | null;
  status: ChatFriendRequestStatus;
  updatedAt: string;
}

export interface ChatFriendRequests {
  accepted: ChatFriendRequest[];
  incoming: ChatFriendRequest[];
  outgoing: ChatFriendRequest[];
}

export interface ChatConversationMember {
  archivedAt: string | null;
  conversationId: string;
  id: string;
  joinedAt: string;
  lastReadAt: string | null;
  mutedAt: string | null;
  pinnedAt: string | null;
  role: 'admin' | 'assistant' | 'member' | 'owner';
  user: ChatUserProfile;
  userId: string;
}

export interface ChatAttachment {
  contentType: string | null;
  conversationId: string;
  createdAt: string;
  filename: string;
  fullPath: string | null;
  id: string;
  messageId: string | null;
  sizeBytes: number | null;
  storageWsId: string | null;
  storagePath: string;
  uploaderId: string | null;
}

export interface ChatAttachmentDraft {
  contentType: string | null;
  filename: string;
  fullPath: string | null;
  path: string;
  sizeBytes: number | null;
  storageWsId?: string | null;
}

export interface ChatReactionSummary {
  count: number;
  emoji: string;
  userIds: string[];
}

export interface ChatMessage {
  attachments: ChatAttachment[];
  content: string;
  conversationId: string;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  id: string;
  kind: ChatMessageKind;
  metadata: Record<string, unknown>;
  reactions: ChatReactionSummary[];
  replyToMessageId: string | null;
  sender: ChatUserProfile | null;
  senderId: string | null;
  updatedAt: string | null;
}

export interface ChatLinkPreview {
  description: string | null;
  error?: string | null;
  imageUrl: string | null;
  siteName: string | null;
  title: string | null;
  url: string;
}

export interface ChatSharedLink {
  conversationId: string;
  createdAt: string;
  messageId: string;
  sender: ChatUserProfile | null;
  url: string;
}

export interface ChatSharedContent {
  files: ChatAttachment[];
  links: ChatSharedLink[];
  photos: ChatAttachment[];
}

export interface ChatAiSettings {
  autoReply: boolean;
  conversationId: string;
  creditSource: ChatAiCreditSource;
  creditWsId: string | null;
  enabled: boolean;
  modelId: string | null;
  personalWorkspaceId: string | null;
  systemPrompt: string | null;
  thinkingMode: ChatAiThinkingMode;
  updatedAt: string | null;
}

export interface UpdateChatAiSettingsPayload {
  creditSource?: ChatAiCreditSource;
  creditWsId?: string | null;
  modelId?: string | null;
  systemPrompt?: string | null;
  thinkingMode?: ChatAiThinkingMode;
}

export interface ChatAiTokenUsage {
  cachedInputTokens: number;
  cachedOutputTokens: number;
  costUsd: number;
  imageInputCount: number;
  imageOutputCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  searchCount: number;
  totalTokens: number;
}

export interface ChatAiContextBreakdownEntry {
  chars: number;
  id: string;
  kind: ChatMessageKind;
  label: string;
  tokensEstimate: number;
}

export interface ChatAiMessageUsage {
  contentPreview: string;
  contextBreakdown: ChatAiContextBreakdownEntry[];
  createdAt: string;
  exact: boolean;
  id: string;
  model: string | null;
  role: string;
  usage: ChatAiTokenUsage;
}

export interface ChatAiObservability {
  contextBreakdown: ChatAiContextBreakdownEntry[];
  messages: ChatAiMessageUsage[];
  totals: ChatAiTokenUsage & {
    messageCount: number;
  };
}

export interface ChatConversation {
  aiEnabled: boolean;
  archivedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  description: string | null;
  id: string;
  latestMessage: ChatMessage | null;
  memberCount: number;
  members: ChatConversationMember[];
  metadata: Record<string, unknown>;
  title: string | null;
  type: ChatConversationType;
  unreadCount: number;
  updatedAt: string;
  wsId: string;
}

export interface ChatConversationPage {
  conversations: ChatConversation[];
  nextOffset: number | null;
}

export interface CreateChatConversationPayload {
  aiEnabled?: boolean;
  autoReply?: boolean;
  description?: string | null;
  metadata?: Record<string, unknown>;
  modelId?: string | null;
  participantUserIds?: string[];
  systemPrompt?: string | null;
  title?: string | null;
  type: ChatConversationType;
}

export interface DeleteChatConversationResult {
  conversationId: string;
  mode: 'archived' | 'left';
  type: ChatConversationType;
}

export interface GenerateChatConversationTitleResult {
  conversation: ChatConversation;
  title: string;
}

export interface UpdateChatConversationPayload {
  description?: string | null;
  pinned?: boolean;
  title?: string | null;
}

export interface SendChatMessagePayload {
  attachments?: ChatAttachmentDraft[];
  content: string;
  kind?: ChatMessageKind;
  replyToMessageId?: string | null;
}

export interface SendChatMessageResult {
  assistantError?: string;
  message: ChatMessage;
  messages?: ChatMessage[];
}

export type ChatMessageStreamEvent =
  | {
      message: ChatMessage;
      type: 'message';
    }
  | {
      delta: string;
      type: 'assistant_delta';
    }
  | {
      part: Record<string, unknown>;
      type: 'assistant_part';
    }
  | {
      messages: ChatMessage[];
      type: 'messages';
    }
  | {
      type: 'done';
    }
  | {
      message: string;
      type: 'error';
    };

export interface SendChatMessageStreamHandlers {
  onAssistantDelta?: (delta: string) => void;
  onAssistantPart?: (part: Record<string, unknown>) => void;
  onMessage?: (message: ChatMessage) => void;
  onMessages?: (messages: ChatMessage[]) => void;
}

export interface WorkspaceChatChannel {
  created_at: string | null;
  created_by: string | null;
  description?: string | null;
  id: string;
  is_private?: boolean | null;
  name: string;
  updated_at?: string | null;
  ws_id: string;
}

export interface WorkspaceChatMessage {
  channel_id: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
  id: string;
  updated_at: string | null;
  user_id: string;
}

export interface WorkspaceChatParticipant {
  channel_id: string;
  last_read_at: string | null;
  user_id: string;
}
