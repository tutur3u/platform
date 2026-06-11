import type { ChatConversation } from '@tuturuuu/internal-api';
import type { ChatConversationScope } from './utils';

export type ChatConversationSectionLabels = {
  ai: string;
  channel: string;
  direct: string;
  group: string;
};

export type ChatConversationSourceLabels = {
  external: string;
  zaloPersonal: string;
};

export interface ChatConversationSourceGroup {
  conversations: ChatConversation[];
  id: string;
  label: string;
}

export interface ChatConversationSection {
  conversations: ChatConversation[];
  label: string | null;
  sectionType: ChatConversation['type'];
  sourceGroups: ChatConversationSourceGroup[];
}

const DEFAULT_SOURCE_LABELS = {
  external: 'External source',
  zaloPersonal: 'Zalo Personal',
} as const satisfies ChatConversationSourceLabels;

export function getChatConversationSections({
  conversations,
  labels,
  scope,
  sourceLabels = DEFAULT_SOURCE_LABELS,
}: {
  conversations: ChatConversation[];
  labels: ChatConversationSectionLabels;
  scope?: ChatConversationScope;
  sourceLabels?: ChatConversationSourceLabels;
}): ChatConversationSection[] {
  if (scope === 'workspaces') {
    return [
      createChatConversationSection({
        conversations: conversations.filter(
          (conversation) => conversation.type === 'channel'
        ),
        label: labels.channel,
        sectionType: 'channel',
        sourceLabels,
      }),
      createChatConversationSection({
        conversations: conversations.filter(
          (conversation) => conversation.type === 'ai'
        ),
        label: labels.ai,
        sectionType: 'ai',
        sourceLabels,
      }),
    ];
  }

  if (scope === 'personal') {
    return [
      createChatConversationSection({
        conversations: conversations.filter(
          (conversation) => conversation.type === 'direct'
        ),
        label: labels.direct,
        sectionType: 'direct',
        sourceLabels,
      }),
      createChatConversationSection({
        conversations: conversations.filter(
          (conversation) => conversation.type === 'group'
        ),
        label: labels.group,
        sectionType: 'group',
        sourceLabels,
      }),
      createChatConversationSection({
        conversations: conversations.filter(
          (conversation) => conversation.type === 'channel'
        ),
        label: labels.channel,
        sectionType: 'channel',
        sourceLabels,
      }),
      createChatConversationSection({
        conversations: conversations.filter(
          (conversation) => conversation.type === 'ai'
        ),
        label: labels.ai,
        sectionType: 'ai',
        sourceLabels,
      }),
    ];
  }

  return [
    createChatConversationSection({
      conversations,
      label: null,
      sectionType: 'direct',
      sourceLabels,
    }),
  ];
}

export function getChatConversationSourceGroups({
  conversations,
  labels = DEFAULT_SOURCE_LABELS,
}: {
  conversations: ChatConversation[];
  labels?: ChatConversationSourceLabels;
}) {
  const groups = new Map<string, ChatConversationSourceGroup>();

  for (const conversation of conversations) {
    const sourceGroup = getChatConversationSourceGroup(conversation, labels);

    if (!sourceGroup) continue;

    const group = groups.get(sourceGroup.id);

    if (group) {
      group.conversations.push(conversation);
    } else {
      groups.set(sourceGroup.id, {
        ...sourceGroup,
        conversations: [conversation],
      });
    }
  }

  return [...groups.values()];
}

function createChatConversationSection({
  conversations,
  label,
  sectionType,
  sourceLabels,
}: {
  conversations: ChatConversation[];
  label: string | null;
  sectionType: ChatConversation['type'];
  sourceLabels: ChatConversationSourceLabels;
}): ChatConversationSection {
  const sourceGroups = getChatConversationSourceGroups({
    conversations,
    labels: sourceLabels,
  });
  const sourceConversationIds = new Set(
    sourceGroups.flatMap((group) =>
      group.conversations.map((conversation) => conversation.id)
    )
  );

  return {
    conversations: conversations.filter(
      (conversation) => !sourceConversationIds.has(conversation.id)
    ),
    label,
    sectionType,
    sourceGroups,
  };
}

function getChatConversationSourceGroup(
  conversation: ChatConversation,
  labels: ChatConversationSourceLabels
): Omit<ChatConversationSourceGroup, 'conversations'> | null {
  const metadata = conversation.metadata ?? {};

  if (metadata.source !== 'ai-agent-external-thread') return null;

  const adapter = readString(metadata.adapter);

  if (adapter !== 'zalo') return null;

  const agentId = readString(metadata.agentId) ?? 'unknown-agent';
  const channelId =
    readString(metadata.channelId) ??
    readString(metadata.externalChannelId) ??
    'unknown-channel';

  return {
    id: `external:${adapter}:${agentId}:${channelId}`,
    label: labels.zaloPersonal,
  };
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
