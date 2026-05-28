import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
} from '@tuturuuu/internal-api';

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
    conversation?.metadata?.source === 'ai-agent' &&
    conversation.metadata.readOnly === true
  );
}

export interface ChatPreviewLabels {
  attachment?: string;
  message?: string;
  messageDeleted?: string;
  noMessagesYet?: string;
}

export function getLastMessagePreview(
  message?: ChatMessage | null,
  labels: ChatPreviewLabels = {}
) {
  if (!message) return labels.noMessagesYet ?? '';
  if (message.deletedAt) return labels.messageDeleted ?? '';
  if (message.content.trim()) return message.content.trim();
  if (message.attachments.length > 0) {
    return message.attachments[0]?.filename ?? labels.attachment ?? '';
  }
  return labels.message ?? '';
}
