import {
  type ChatConversationType,
  InternalApiError,
} from '@tuturuuu/internal-api';
import type { useTranslations } from 'next-intl';
import type { ChatConversationScope } from './utils';

export function getConversationMetadata(
  conversationScope: ChatConversationScope | undefined,
  type: ChatConversationType
) {
  if (conversationScope !== 'personal') return undefined;
  if (type === 'ai') return { source: 'personal-ai-chat' };
  if (type === 'channel') return { scope: 'personal' };
  return undefined;
}

export function StepTitle({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h3 className="font-medium text-sm">{title}</h3>
      <p className="mt-1 text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

export function getCreateConversationErrorDescription(
  error: unknown,
  t: ReturnType<typeof useTranslations>
) {
  if (!(error instanceof InternalApiError)) return undefined;

  if (error.message.includes('chat_target_not_invitable')) {
    return t('conversation_create_target_not_invitable');
  }

  if (error.message.includes('chat_direct_requires_one_target')) {
    return t('conversation_create_direct_requires_one_target');
  }

  if (error.message.includes('chat_group_requires_members')) {
    return t('conversation_create_group_requires_members');
  }

  if (error.message.includes('chat_permission_required')) {
    return t('conversation_create_permission_required');
  }

  return error.message;
}
