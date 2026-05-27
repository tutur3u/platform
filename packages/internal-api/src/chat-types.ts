export type ChatConversationType = 'ai' | 'channel' | 'direct' | 'group';
export type ChatMessageKind = 'assistant' | 'system' | 'user';

export interface ChatUserProfile {
  avatarUrl: string | null;
  displayName: string;
  handle: string | null;
  id: string;
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
  storagePath: string;
  uploaderId: string | null;
}

export interface ChatAttachmentDraft {
  contentType: string | null;
  filename: string;
  fullPath: string | null;
  path: string;
  sizeBytes: number | null;
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

export interface SendChatMessagePayload {
  attachments?: ChatAttachmentDraft[];
  content: string;
  kind?: ChatMessageKind;
  replyToMessageId?: string | null;
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
