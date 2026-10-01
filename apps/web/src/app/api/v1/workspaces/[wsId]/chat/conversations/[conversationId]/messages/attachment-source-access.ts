import {
  canAccessFinanceTransactionStoragePath,
  getFinanceTransactionIdFromStoragePath,
} from '@tuturuuu/finance-core/storage-access';
import { isReservedMobileDeploymentDrivePath } from '@tuturuuu/storage-core/mobile-deployment/storage-policy';
import type { WorkspaceStorageProvider } from '@tuturuuu/storage-core/workspace-storage-config';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { SessionAuthContext } from '@/lib/api-auth';
import {
  type ChatAttachment,
  callPrivateChatRpc,
} from '@/lib/chat/private-rpc';

export async function authorizeAttachmentSource({
  auth,
  path,
  sourceWsId,
  targetWsId,
  persisted,
}: {
  auth: SessionAuthContext;
  path: string;
  sourceWsId: string;
  targetWsId: string;
  persisted?: { attachmentId: string; conversationId: string };
}) {
  const normalizedWsId = await normalizeWorkspaceId(sourceWsId, auth.supabase);
  const normalizedPath = sanitizePath(path);
  if (
    !normalizedPath ||
    [...normalizedPath].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  )
    throw new Error('Invalid attachment source path');
  // Encoded structural aliases remain unsupported. Literal object keys are
  // encoded only at the provider transport boundary, after authorization.
  if (/%(?:2e|2f|5c|25)/iu.test(normalizedPath))
    throw new Error('Invalid attachment source path');
  if (isReservedMobileDeploymentDrivePath(normalizedWsId, normalizedPath))
    throw new Error('Attachment source access denied');

  if (persisted) {
    const attachment = await callPrivateChatRpc<ChatAttachment>(
      'chat_get_attachment',
      {
        p_actor_user_id: auth.user.id,
        p_attachment_id: persisted.attachmentId,
        p_conversation_id: persisted.conversationId,
        p_ws_id: targetWsId,
      }
    );
    if (
      !attachment ||
      attachment.storagePath !== normalizedPath ||
      (attachment.storageWsId ?? targetWsId) !== normalizedWsId
    )
      throw new Error('Attachment source access denied');
  } else if (normalizedPath.startsWith('chats/ai/resources/')) {
    const chatId = normalizedPath.split('/')[3];
    const { data, error } = await auth.supabase
      .from('ai_chats')
      .select('id')
      .eq('id', chatId ?? '')
      .eq('creator_id', auth.user.id)
      .maybeSingle();
    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: auth.user.id,
      supabase: auth.supabase,
    });
    if (error || !data || !membership.ok)
      throw new Error('Attachment source access denied');
  } else if (normalizedPath.startsWith('chats/')) {
    const conversationId = normalizedPath.split('/')[1];
    const prepared = await callPrivateChatRpc<{
      pathPrefix: string;
      storageWsId: string;
    }>('chat_prepare_attachment', {
      p_actor_user_id: auth.user.id,
      p_conversation_id: conversationId,
      p_filename: normalizedPath.split('/').at(-1),
      p_size_bytes: null,
      p_ws_id: targetWsId,
    });
    if (
      !prepared ||
      prepared.storageWsId !== normalizedWsId ||
      !normalizedPath.startsWith(`${prepared.pathPrefix}/`)
    )
      throw new Error('Attachment source access denied');
  } else {
    const permissions = await getPermissions({
      user: auth.user,
      wsId: normalizedWsId,
    });
    if (!permissions) throw new Error('Attachment source access denied');
    const taskMedia =
      normalizedPath === 'task-images' ||
      normalizedPath.startsWith('task-images/');
    const finance = getFinanceTransactionIdFromStoragePath(normalizedPath);
    const allowed = taskMedia
      ? !permissions.withoutPermission('manage_drive_tasks_directory')
      : !permissions.withoutPermission('view_drive') ||
        (finance
          ? await canAccessFinanceTransactionStoragePath({
              access: 'read',
              normalizedWsId,
              path: normalizedPath,
              permissions,
              supabase: auth.supabase,
              userId: auth.user.id,
            })
          : false);
    if (!allowed) throw new Error('Attachment source access denied');
  }
  return { sourceWsId: normalizedWsId, path: normalizedPath };
}

// The locked Supabase SDK interpolates download paths into a URL. Quote each
// literal segment so its provider decodes exactly the key we authorized. R2
// accepts an object key directly and performs its own transport encoding.
export function attachmentSourceDownloadPath(
  path: string,
  provider: WorkspaceStorageProvider
) {
  return provider === 'supabase'
    ? path.split('/').map(encodeURIComponent).join('/')
    : path;
}
