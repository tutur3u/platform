import type {
  ChatConversation,
  ChatConversationType,
  ChatMessage,
  ChatUserProfile,
} from '@tuturuuu/internal-api';

export type ChatConversationScope = 'personal' | 'workspaces';
export type ChatConversationArchiveFilter = 'active' | 'all' | 'archived';

export const DEFAULT_CHAT_SCOPE: ChatConversationScope = 'personal';
export const CHAT_CONVERSATION_TYPE_FILTERS = [
  'direct',
  'group',
  'channel',
  'ai',
] as const satisfies ChatConversationType[];

export function normalizeChatConversationScope(
  scope?: string | null
): ChatConversationScope {
  return scope === 'workspaces' ? 'workspaces' : 'personal';
}

export function getChatConversationScope(
  conversation: Pick<ChatConversation, 'type'>
): ChatConversationScope {
  return conversation.type === 'direct' || conversation.type === 'group'
    ? 'personal'
    : 'workspaces';
}

export function isChatConversation(value: unknown): value is ChatConversation {
  const conversation = value as Partial<ChatConversation> | null | undefined;

  return Boolean(
    conversation?.id &&
      (conversation.type === 'direct' ||
        conversation.type === 'group' ||
        conversation.type === 'channel' ||
        conversation.type === 'ai')
  );
}

export function getChatConversationTypesForScope(
  scope: ChatConversationScope
): ChatConversationType[] {
  return scope === 'personal' ? ['direct', 'group'] : ['channel', 'ai'];
}

export function filterChatConversationsByScope(
  conversations: ChatConversation[],
  scope: ChatConversationScope
) {
  return conversations.filter(
    (conversation) =>
      isChatConversation(conversation) &&
      getChatConversationScope(conversation) === scope
  );
}

export function filterChatConversations({
  archiveFilter = 'active',
  conversations,
  scope,
  types,
}: {
  archiveFilter?: ChatConversationArchiveFilter;
  conversations: ChatConversation[];
  scope: ChatConversationScope;
  types?: ChatConversationType[];
}) {
  const typeSet = new Set(types ?? getChatConversationTypesForScope(scope));

  return conversations.filter((conversation) => {
    if (!isChatConversation(conversation)) return false;
    if (getChatConversationScope(conversation) !== scope) return false;
    if (!typeSet.has(conversation.type)) return false;
    if (archiveFilter === 'active') return !conversation.archivedAt;
    if (archiveFilter === 'archived') return Boolean(conversation.archivedAt);
    return true;
  });
}

export function getChatInitials(profile?: ChatUserProfile | string | null) {
  const label =
    typeof profile === 'string'
      ? profile
      : profile?.displayName || profile?.handle || 'User';
  return label
    .split(/\s+/u)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getConversationTitle(
  conversation: ChatConversation,
  currentUserId: string,
  fallback?: {
    ai?: string;
    channel?: string;
    chat?: string;
    direct?: string;
    group?: string;
  }
) {
  if (conversation.title) return conversation.title;

  if (conversation.type === 'direct') {
    const otherMember = conversation.members.find(
      (member) => member.userId !== currentUserId
    );
    return (
      otherMember?.user.displayName ?? fallback?.direct ?? 'Direct message'
    );
  }

  if (conversation.type === 'ai') return fallback?.ai ?? 'Mira';
  if (conversation.type === 'channel') {
    return fallback?.channel ?? 'Untitled channel';
  }
  if (conversation.type === 'group') return fallback?.group ?? 'Group chat';

  return fallback?.chat ?? 'Untitled chat';
}

export function formatChatTime(value?: string | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatChatRelativeTime(value?: string | null) {
  if (!value) return '';

  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';

  const diff = time - Date.now();
  const abs = Math.abs(diff);

  if (abs < 60_000) return 'now';

  const units: Array<[string, number]> = [
    ['y', 31_536_000_000],
    ['mo', 2_592_000_000],
    ['w', 604_800_000],
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
  ];

  for (const [label, size] of units) {
    if (abs >= size) {
      const count = Math.max(1, Math.round(abs / size));
      return diff > 0 ? `in ${count}${label}` : `${count}${label}`;
    }
  }

  return 'now';
}

export function formatChatDate(value?: string | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

export function formatFileSize(size?: number | null) {
  if (!size) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function isReadOnlyChatConversation(
  conversation?: Pick<ChatConversation, 'metadata'> | null
) {
  return (
    (conversation?.metadata?.source === 'ai-agent' ||
      conversation?.metadata?.source === 'ai-chat' ||
      conversation?.metadata?.source === 'legacy-ai-chat') &&
    conversation.metadata.readOnly === true
  );
}

export interface ChatPreviewLabels {
  attachment?: string;
  message?: string;
  messageDeleted?: string;
  noMessagesYet?: string;
  systemEvent?: string;
}

export function getLastMessagePreview(
  message?: ChatMessage | null,
  labels: ChatPreviewLabels = {}
) {
  if (!message) return labels.noMessagesYet ?? '';
  if (message.deletedAt) return labels.messageDeleted ?? '';
  if (message.kind === 'system')
    return labels.systemEvent ?? labels.message ?? '';
  if (message.content.trim()) return message.content.trim();
  if (message.attachments.length > 0) {
    return message.attachments[0]?.filename ?? labels.attachment ?? '';
  }
  return labels.message ?? '';
}
