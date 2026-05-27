'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateWorkspaceCourseModulesFromStorage,
  InternalApiError,
  uploadWorkspaceUserGroupStorageFile,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { moduleGroupsKey, modulesKey } from './use-module-detail';

export type AiGenerateStage =
  | 'idle'
  | 'uploading'
  | 'generating'
  | 'done'
  | 'error';

export interface AiGenerateState {
  stage: AiGenerateStage;
  uploadProgress: number; // 0-100
  error: string | null;
  result: {
    totalModules: number;
    totalQuizzes: number;
    totalFlashcards: number;
    creditsCharged?: number;
  } | null;
}

export function useAiGenerate(wsId: string, courseId: string) {
  const qc = useQueryClient();

  function redirectToLogin() {
    if (typeof window === 'undefined') return;

    const nextPath = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  function isUnauthorizedError(error: unknown) {
    return error instanceof InternalApiError && error.status === 401;
  }

  const mutation = useMutation<
    AiGenerateState['result'],
    Error,
    {
      context?: string;
      file?: File;
      fileName?: string;
      onProgress?: (pct: number) => void;
      storagePath?: string;
      fileId?: string;
    }
  >({
    mutationFn: async ({
      context,
      file,
      fileName,
      onProgress,
      storagePath,
      fileId,
    }) => {
      try {
        let selectedStoragePath = storagePath?.trim();
        let selectedFileName = fileName?.trim();

        if (file) {
          // 1. Upload file to user-group storage
          const uploaded = await uploadWorkspaceUserGroupStorageFile(
            wsId,
            courseId,
            file,
            {
              onUploadProgress: ({ percent }) => onProgress?.(percent),
            }
          );

          selectedStoragePath = uploaded.path;
          selectedFileName = file.name;
        }

        if (!fileId && (!selectedStoragePath || !selectedFileName)) {
          throw new Error('Please select a file or storage document.');
        }

        // 2. Generate course modules from the selected storage file
        const response = await generateWorkspaceCourseModulesFromStorage(wsId, {
          context: context?.trim() || undefined,
          groupId: courseId,
          storagePath: selectedStoragePath,
          fileName: selectedFileName,
          fileId,
        });

        return {
          totalModules: response.createdModules?.length ?? 0,
          totalQuizzes: 0,
          totalFlashcards: 0,
          creditsCharged: response.metadata?.creditsCharged,
        };
      } catch (error) {
        if (isUnauthorizedError(error)) {
          redirectToLogin();
        }

        throw error;
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: moduleGroupsKey(wsId, courseId) });
      qc.invalidateQueries({ queryKey: modulesKey(wsId, courseId) });
      toast.success(
        `Generated ${result?.totalModules ?? 0} module${(result?.totalModules ?? 0) !== 1 ? 's' : ''} successfully.`
      );
    },
    onError: (err) => {
      if (isUnauthorizedError(err)) {
        return;
      }

      toast.error(`AI generation failed: ${err.message}`);
    },
  });

  return mutation;
}
