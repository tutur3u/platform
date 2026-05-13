'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateWorkspaceCourseModulesFromStorage,
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

  const mutation = useMutation<
    AiGenerateState['result'],
    Error,
    { file: File; onProgress: (pct: number) => void }
  >({
    mutationFn: async ({ file, onProgress }) => {
      // 1. Upload file to user-group storage
      const uploaded = await uploadWorkspaceUserGroupStorageFile(
        wsId,
        courseId,
        file,
        {
          onUploadProgress: ({ percent }) => onProgress(percent),
        }
      );

      // 2. Generate course modules from the uploaded file
      const response = await generateWorkspaceCourseModulesFromStorage(wsId, {
        groupId: courseId,
        storagePath: uploaded.path,
        fileName: file.name,
      });

      return {
        totalModules: response.createdModules?.length ?? 0,
        totalQuizzes: 0,
        totalFlashcards: 0,
        creditsCharged: response.metadata?.creditsCharged,
      };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: moduleGroupsKey(wsId, courseId) });
      qc.invalidateQueries({ queryKey: modulesKey(wsId, courseId) });
      toast.success(
        `Generated ${result?.totalModules ?? 0} module${(result?.totalModules ?? 0) !== 1 ? 's' : ''} successfully.`
      );
    },
    onError: (err) => {
      toast.error(`AI generation failed: ${err.message}`);
    },
  });

  return mutation;
}
