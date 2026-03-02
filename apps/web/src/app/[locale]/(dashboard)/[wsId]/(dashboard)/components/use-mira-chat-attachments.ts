'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useCallback, useRef, useState } from 'react';
import type { ChatFile, MessageFileAttachment } from './file-preview-chips';
import {
  deleteChatFileMutationFn,
  fetchSignedReadUrlsMutationFn,
  uploadChatFileMutationFn,
  uploadSignedUrlPutMutationFn,
} from './mira-chat-file-api';

interface UseMiraChatAttachmentsParams {
  wsId: string;
  chatId?: string;
  deleteFileFailedMessage: string;
}

export function useMiraChatAttachments({
  wsId,
  chatId,
  deleteFileFailedMessage,
}: UseMiraChatAttachmentsParams) {
  const queryClient = useQueryClient();
  const [attachedFiles, setAttachedFiles] = useState<ChatFile[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<
    Map<string, MessageFileAttachment[]>
  >(new Map());

  const attachedFilesRef = useRef(attachedFiles);
  attachedFilesRef.current = attachedFiles;

  const messageAttachmentsRef = useRef(messageAttachments);
  messageAttachmentsRef.current = messageAttachments;

  const uploadSignedUrlPutMutation = useMutation({
    mutationFn: uploadSignedUrlPutMutationFn,
  });
  const fetchSignedReadUrlsMutation = useMutation({
    mutationFn: fetchSignedReadUrlsMutationFn,
  });
  const deleteChatFileFromStorageMutation = useMutation({
    mutationFn: deleteChatFileMutationFn,
    onSuccess: async (deleted, variables) => {
      if (!deleted.path) return;
      await queryClient.invalidateQueries({
        queryKey: ['chatFiles', variables.wsId],
      });
    },
  });
  const uploadChatFileMutation = useMutation({
    mutationFn: (args: {
      wsId: string;
      chatId: string | undefined;
      file: File;
    }) =>
      uploadChatFileMutationFn({
        ...args,
        uploadViaSignedPut: uploadSignedUrlPutMutation.mutateAsync,
      }),
  });

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      const newChatFiles: ChatFile[] = files.map((file) => ({
        id: generateRandomUUID(),
        file,
        previewUrl:
          file.type.startsWith('image/') || file.type.startsWith('video/')
            ? URL.createObjectURL(file)
            : null,
        storagePath: null,
        signedUrl: null,
        status: 'pending' as const,
      }));

      setAttachedFiles((prev) => [...prev, ...newChatFiles]);

      for (const chatFile of newChatFiles) {
        setAttachedFiles((prev) =>
          prev.map((file) =>
            file.id === chatFile.id ? { ...file, status: 'uploading' } : file
          )
        );

        const { path, error } = await uploadChatFileMutation.mutateAsync({
          wsId,
          chatId,
          file: chatFile.file,
        });

        if (error || !path) {
          setAttachedFiles((prev) =>
            prev.map((file) =>
              file.id === chatFile.id
                ? { ...file, storagePath: path, status: 'error' }
                : file
            )
          );
          toast.error(`Failed to upload ${chatFile.file.name}`);
          continue;
        }

        const stillAttached = attachedFilesRef.current.some(
          (file) => file.id === chatFile.id
        );
        if (!stillAttached) {
          const deleted = await deleteChatFileFromStorageMutation.mutateAsync({
            wsId,
            path,
          });
          if (deleted.error) {
            toast.error(deleteFileFailedMessage);
          }
          continue;
        }

        let readUrls: Map<string, string>;
        try {
          readUrls = await fetchSignedReadUrlsMutation.mutateAsync([path]);
        } catch (error) {
          console.error('[Mira Chat] Failed to fetch signed read URLs:', error);
          setAttachedFiles((prev) =>
            prev.map((file) =>
              file.id === chatFile.id
                ? { ...file, storagePath: path, status: 'error' }
                : file
            )
          );
          toast.error(`Failed to prepare ${chatFile.file.name}`);
          continue;
        }
        const signedUrl = readUrls.get(path) ?? null;

        setAttachedFiles((prev) =>
          prev.map((file) =>
            file.id === chatFile.id
              ? { ...file, storagePath: path, signedUrl, status: 'uploaded' }
              : file
          )
        );
      }
    },
    [
      chatId,
      deleteChatFileFromStorageMutation,
      deleteFileFailedMessage,
      fetchSignedReadUrlsMutation,
      uploadChatFileMutation,
      wsId,
    ]
  );

  const handleFileRemove = useCallback(
    (id: string) => {
      const file = attachedFilesRef.current.find((item) => item.id === id);
      const removedStoragePath = file?.storagePath ?? null;

      if (file?.previewUrl) {
        const isSnapshotted = Array.from(
          messageAttachmentsRef.current.values()
        ).some((attachments) =>
          attachments.some(
            (attachment) => attachment.previewUrl === file.previewUrl
          )
        );
        if (!isSnapshotted) URL.revokeObjectURL(file.previewUrl);
      }

      setAttachedFiles((prev) => prev.filter((item) => item.id !== id));

      if (!removedStoragePath) return;

      void deleteChatFileFromStorageMutation
        .mutateAsync({
          wsId,
          path: removedStoragePath,
        })
        .then((deleted) => {
          if (deleted.error) toast.error(deleteFileFailedMessage);
        });
    },
    [deleteChatFileFromStorageMutation, deleteFileFailedMessage, wsId]
  );

  const snapshotAttachmentsForMessage = useCallback((messageId: string) => {
    const currentAttachedFiles = attachedFilesRef.current;
    if (currentAttachedFiles.length === 0) return;

    const meta: MessageFileAttachment[] = currentAttachedFiles
      .filter((file) => file.status === 'uploaded')
      .map((file) => ({
        id: file.id,
        name: file.file.name,
        size: file.file.size,
        type: file.file.type,
        previewUrl: file.previewUrl,
        storagePath: file.storagePath,
        signedUrl: file.signedUrl ?? null,
      }));

    if (meta.length === 0) return;

    setMessageAttachments((prev) => {
      const next = new Map(prev).set(messageId, meta);
      messageAttachmentsRef.current = next;
      return next;
    });
  }, []);

  const clearAttachedFiles = useCallback(() => {
    setAttachedFiles((prev) => {
      const preservedUrls = new Set<string>();

      for (const attachments of messageAttachmentsRef.current.values()) {
        for (const attachment of attachments) {
          if (attachment.previewUrl) preservedUrls.add(attachment.previewUrl);
        }
      }

      for (const file of prev) {
        if (file.previewUrl && !preservedUrls.has(file.previewUrl)) {
          URL.revokeObjectURL(file.previewUrl);
        }
      }

      return [];
    });
  }, []);

  const cleanupPendingUploads = useCallback(async () => {
    const pendingStoragePaths = attachedFilesRef.current
      .map((file) => file.storagePath)
      .filter(
        (path): path is string => typeof path === 'string' && path.length > 0
      );

    if (pendingStoragePaths.length === 0) return;

    await Promise.all(
      pendingStoragePaths.map(async (path) => {
        try {
          const deleted = await deleteChatFileFromStorageMutation.mutateAsync({
            wsId,
            path,
          });
          if (deleted.error) {
            console.error(
              '[Mira Chat] Failed to delete pending upload during reset:',
              {
                wsId,
                path,
                error: deleted.error,
              }
            );
          }
        } catch (error) {
          console.error(
            '[Mira Chat] Failed to clean up pending upload during reset:',
            {
              wsId,
              path,
              error,
            }
          );
        }
      })
    );
  }, [deleteChatFileFromStorageMutation, wsId]);

  return {
    attachedFiles,
    attachedFilesRef,
    clearAttachedFiles,
    cleanupPendingUploads,
    handleFileRemove,
    handleFilesSelected,
    messageAttachments,
    messageAttachmentsRef,
    setMessageAttachments,
    snapshotAttachmentsForMessage,
  };
}
