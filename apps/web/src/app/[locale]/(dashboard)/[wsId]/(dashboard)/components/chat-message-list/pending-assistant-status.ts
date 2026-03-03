import type { UIMessage } from '@tuturuuu/ai/types';
import type { MessageFileAttachment } from '../file-preview-chips';
import { getMiraToolName } from '../mira-tool-part-utils';
import {
  getRenderableMessageAttachments,
  hasTextContent,
  humanizeToolName,
  isNoActionSelectToolsPart,
} from './helpers';
import { getToolPartStatus } from './tool-components/tool-status';
import type { ToolPartData } from './types';

type Translate = (
  key: string,
  values?: Record<string, number | string>
) => string;

type PendingAssistantStatusKind = 'attachment' | 'default' | 'tool';

export interface PendingAssistantStatus {
  badge: string | null;
  detail: string;
  kind: PendingAssistantStatusKind;
  title: string;
}

function isToolPartData(part: unknown): part is ToolPartData {
  if (!part || typeof part !== 'object') return false;

  const type = (part as { type?: unknown }).type;
  return (
    type === 'dynamic-tool' ||
    (typeof type === 'string' && type.startsWith('tool-'))
  );
}

function classifyAttachmentKind(
  attachments: MessageFileAttachment[]
): 'audio' | 'document' | 'image' | 'mixed' | 'video' {
  const distinctKinds = new Set(
    attachments.map((attachment) => {
      const type = attachment.type.toLowerCase();
      if (type.startsWith('audio/')) return 'audio';
      if (type.startsWith('image/')) return 'image';
      if (type.startsWith('video/')) return 'video';
      if (
        type.startsWith('text/') ||
        type === 'application/pdf' ||
        type.includes('document') ||
        type.includes('spreadsheet') ||
        type.includes('presentation') ||
        type.includes('sheet') ||
        type.includes('word') ||
        type.includes('excel') ||
        type.includes('powerpoint') ||
        type.includes('json')
      ) {
        return 'document';
      }
      return 'mixed';
    })
  );

  if (distinctKinds.size !== 1) return 'mixed';

  const [kind] = [...distinctKinds];
  return kind ?? 'mixed';
}

function getAttachmentStatus(
  attachments: MessageFileAttachment[],
  t: Translate
): PendingAssistantStatus {
  const count = attachments.length;
  const kind = classifyAttachmentKind(attachments);

  if (count === 1) {
    if (kind === 'audio') {
      return {
        badge: t('thinking_status_badge_single_attachment'),
        detail: t('thinking_status_audio_body'),
        kind: 'attachment',
        title: t('thinking_status_audio_title'),
      };
    }

    if (kind === 'image') {
      return {
        badge: t('thinking_status_badge_single_attachment'),
        detail: t('thinking_status_image_body'),
        kind: 'attachment',
        title: t('thinking_status_image_title'),
      };
    }

    if (kind === 'video') {
      return {
        badge: t('thinking_status_badge_single_attachment'),
        detail: t('thinking_status_video_body'),
        kind: 'attachment',
        title: t('thinking_status_video_title'),
      };
    }

    if (kind === 'document') {
      return {
        badge: t('thinking_status_badge_single_attachment'),
        detail: t('thinking_status_document_body'),
        kind: 'attachment',
        title: t('thinking_status_document_title'),
      };
    }
  }

  return {
    badge: t('thinking_status_badge_attachments', { count }),
    detail: t('thinking_status_attachments_body'),
    kind: 'attachment',
    title: t('thinking_status_attachments_title', { count }),
  };
}

function getToolStatus(toolName: string, t: Translate): PendingAssistantStatus {
  switch (toolName) {
    case 'select_tools':
      return {
        badge: null,
        detail: t('thinking_status_planning_body'),
        kind: 'tool',
        title: t('thinking_status_planning_title'),
      };
    case 'list_chat_files':
      return {
        badge: t('thinking_status_badge_files'),
        detail: t('thinking_status_list_chat_files_body'),
        kind: 'tool',
        title: t('thinking_status_list_chat_files_title'),
      };
    case 'load_chat_file':
      return {
        badge: t('thinking_status_badge_files'),
        detail: t('thinking_status_load_chat_file_body'),
        kind: 'tool',
        title: t('thinking_status_load_chat_file_title'),
      };
    case 'convert_file_to_markdown':
      return {
        badge: t('thinking_status_badge_extracting'),
        detail: t('thinking_status_convert_file_body'),
        kind: 'tool',
        title: t('thinking_status_convert_file_title'),
      };
    case 'rename_chat_file':
      return {
        badge: t('thinking_status_badge_files'),
        detail: t('thinking_status_rename_chat_file_body'),
        kind: 'tool',
        title: t('thinking_status_rename_chat_file_title'),
      };
    default:
      return {
        badge: null,
        detail: t('thinking_status_tool_body', {
          tool: humanizeToolName(toolName),
        }),
        kind: 'tool',
        title: t('thinking_status_tool_title', {
          tool: humanizeToolName(toolName),
        }),
      };
  }
}

function hasOnlyHiddenPlannerParts(message: UIMessage): boolean {
  return (
    message.parts.length > 0 &&
    message.parts.every((part) => {
      if (isToolPartData(part)) {
        return isNoActionSelectToolsPart(part);
      }

      return part.type === 'step-start';
    })
  );
}

function findPendingTool(messages: UIMessage[]): string | null {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex--
  ) {
    const message = messages[messageIndex];
    if (message?.role !== 'assistant') continue;

    for (
      let partIndex = message.parts.length - 1;
      partIndex >= 0;
      partIndex--
    ) {
      const part = message.parts[partIndex];
      if (!isToolPartData(part)) continue;

      const toolName = getMiraToolName(part);
      if (!toolName || toolName === 'no_action_needed') continue;

      const { isRunning } = getToolPartStatus(part);
      if (isRunning) return toolName;
    }

    if (!hasTextContent(message) && !hasOnlyHiddenPlannerParts(message)) {
      return 'select_tools';
    }
  }

  return null;
}

export function getPendingAssistantStatus({
  messageAttachments,
  messages,
  t,
}: {
  messageAttachments?: Map<string, MessageFileAttachment[]>;
  messages: UIMessage[];
  t: Translate;
}): PendingAssistantStatus {
  const toolName = findPendingTool(messages);
  if (toolName) {
    return getToolStatus(toolName, t);
  }

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const hasHiddenPlannerOnlyAssistant =
    lastAssistantMessage?.role === 'assistant' &&
    hasOnlyHiddenPlannerParts(lastAssistantMessage);

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === 'user') {
    const attachments = getRenderableMessageAttachments(
      lastMessage,
      messageAttachments
    );

    if (attachments.length > 0) {
      return getAttachmentStatus(attachments, t);
    }
  }

  if (hasHiddenPlannerOnlyAssistant) {
    return {
      badge: null,
      detail: t('thinking_status_finalizing_body'),
      kind: 'default',
      title: t('thinking_status_finalizing_title'),
    };
  }

  return {
    badge: null,
    detail: t('thinking_status_default_body'),
    kind: 'default',
    title: t('thinking_status_default_title'),
  };
}
