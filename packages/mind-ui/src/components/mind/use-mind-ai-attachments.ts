'use client';

import { useMutation } from '@tanstack/react-query';
import { deleteAiChatFile, uploadAiChatFile } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useCallback, useRef, useState } from 'react';

export type MindChatFile = {
  file: File;
  id: string;
  previewUrl: string | null;
  status: 'error' | 'uploaded' | 'uploading';
  storagePath: string | null;
};

export function useMindAiAttachments({
  getUploadFailedMessage,
  threadId,
  wsId,
}: {
  getUploadFailedMessage: (name: string) => string;
  threadId: string;
  wsId: string;
}) {
  const [files, setFiles] = useState<MindChatFile[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const upload = await uploadAiChatFile({
        chatId: threadId,
        file,
        workspaceId: wsId,
      });

      return upload.path;
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ path }: { path: string }) =>
      deleteAiChatFile({ path, wsId }),
  });

  const addFiles = useCallback(
    async (selectedFiles: File[]) => {
      const nextFiles = selectedFiles.map((file) => ({
        file,
        id: generateRandomUUID(),
        previewUrl:
          file.type.startsWith('image/') || file.type.startsWith('video/')
            ? URL.createObjectURL(file)
            : null,
        status: 'uploading' as const,
        storagePath: null,
      }));

      setFiles((current) => [...current, ...nextFiles]);

      for (const pendingFile of nextFiles) {
        try {
          const path = await uploadMutation.mutateAsync(pendingFile.file);
          setFiles((current) =>
            current.map((file) =>
              file.id === pendingFile.id
                ? { ...file, status: 'uploaded', storagePath: path }
                : file
            )
          );
        } catch {
          setFiles((current) =>
            current.map((file) =>
              file.id === pendingFile.id ? { ...file, status: 'error' } : file
            )
          );
          toast.error(getUploadFailedMessage(pendingFile.file.name));
        }
      }
    },
    [getUploadFailedMessage, uploadMutation]
  );

  const removeFile = useCallback(
    (id: string) => {
      const file = filesRef.current.find((item) => item.id === id);
      setFiles((current) => current.filter((item) => item.id !== id));

      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      if (file?.storagePath) {
        void removeMutation.mutateAsync({ path: file.storagePath });
      }
    },
    [removeMutation]
  );

  const clearFiles = useCallback(() => {
    setFiles((current) => {
      for (const file of current) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      }
      return [];
    });
  }, []);

  return {
    addFiles,
    clearFiles,
    files,
    removeFile,
  };
}
