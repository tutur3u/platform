'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { apiFetch, uploadToStorageUrl } from '@/lib/api-fetch';
import type { FormStudioInput, FormSubmitInput } from './schema';
import type {
  FormAnalytics,
  FormDefinition,
  FormResponseRecord,
  FormResponseSummary,
  FormResponsesQuestionAnalytics,
} from './types';

type ProgressPayload = {
  sessionId: string;
  lastQuestionId?: string | null;
  lastSectionId?: string | null;
};

export function useSaveFormMutation({
  wsId,
  formId,
}: {
  wsId: string;
  formId?: string;
}) {
  const t = useTranslations('forms');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: FormStudioInput) => {
      const path = formId
        ? `/api/v1/workspaces/${wsId}/forms/${formId}`
        : `/api/v1/workspaces/${wsId}/forms`;
      return apiFetch<{ id: string }>(path, {
        method: formId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', wsId] });
      if (formId) {
        queryClient.invalidateQueries({ queryKey: ['forms', wsId, formId] });
      }
      toast.success(formId ? t('toast.form_updated') : t('toast.form_created'));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('toast.failed_to_save_form')
      );
    },
  });
}

export function useFormShareLink({
  wsId,
  formId,
  enabled = true,
}: {
  wsId: string;
  formId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['forms', wsId, formId, 'share-link'],
    queryFn: async () =>
      apiFetch<{ shareLink: { code: string; active: boolean } }>(
        `/api/v1/workspaces/${wsId}/forms/${formId}/share-link`,
        {
          cache: 'no-store',
        }
      ),
    enabled: enabled && !!formId,
  });
}

export function usePublicFormSubmit(shareCode: string) {
  const t = useTranslations('forms');

  return useMutation({
    mutationFn: async (payload: FormSubmitInput) =>
      apiFetch<{
        responseId: string;
        responseCopyRequested?: boolean;
        responseCopyStatus?: 'sent' | 'rate_limited' | 'failed' | null;
        responseCopySentTo?: string | null;
      }>(`/api/v1/shared/forms/${shareCode}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('toast.failed_to_submit_response')
      );
    },
  });
}

export function usePublicFormResponseCopy(shareCode: string) {
  const t = useTranslations('forms');

  return useMutation({
    mutationFn: async (payload: {
      responseId: string;
      sessionId: string;
      turnstileToken?: string;
    }) =>
      apiFetch<{ responseCopySentTo?: string | null }>(
        `/api/v1/shared/forms/${shareCode}/response-copy`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      ),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('toast.failed_to_submit_response')
      );
    },
  });
}

export function useFormMediaUploadMutation({ wsId }: { wsId: string }) {
  const t = useTranslations('forms');

  return useMutation({
    mutationFn: async ({
      file,
      scope,
    }: {
      file: File;
      scope: 'cover' | 'section' | 'option';
    }) => {
      const upload = await apiFetch<{
        signedUrl: string;
        token: string;
        storagePath: string;
      }>(`/api/v1/workspaces/${wsId}/forms/media`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          scope,
        }),
      });

      await uploadToStorageUrl(upload.signedUrl, file, upload.token);

      const previewUrl = URL.createObjectURL(file);

      return {
        storagePath: upload.storagePath,
        url: previewUrl,
        alt: '',
      };
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('toast.failed_to_upload_image')
      );
    },
  });
}

export function usePublicFormProgress(shareCode: string) {
  return useMutation({
    mutationFn: async (payload: ProgressPayload) =>
      apiFetch<{ ok: true }>(`/api/v1/shared/forms/${shareCode}/progress`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
  });
}

export function useFormDefinitionQuery({
  wsId,
  formId,
  initialData,
}: {
  wsId: string;
  formId: string;
  initialData: FormDefinition;
}) {
  return useQuery({
    queryKey: ['forms', wsId, formId],
    queryFn: async () =>
      apiFetch<{ form: FormDefinition }>(
        `/api/v1/workspaces/${wsId}/forms/${formId}`,
        {
          cache: 'no-store',
        }
      ).then((result) => result.form),
    initialData,
    enabled: !!formId,
  });
}

export function useFormResponsesQuery({
  wsId,
  formId,
  initialData,
  enabled = true,
}: {
  wsId: string;
  formId: string;
  initialData: {
    total: number;
    records: FormResponseRecord[];
    summary: FormResponseSummary;
    questionAnalytics: FormResponsesQuestionAnalytics[];
  };
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['forms', wsId, formId, 'responses'],
    queryFn: async () =>
      apiFetch<{
        total: number;
        records: FormResponseRecord[];
        summary: FormResponseSummary;
        questionAnalytics: FormResponsesQuestionAnalytics[];
      }>(`/api/v1/workspaces/${wsId}/forms/${formId}/responses`, {
        cache: 'no-store',
      }),
    initialData,
    enabled: enabled && !!formId,
  });
}

export function useFormAnalyticsQuery({
  wsId,
  formId,
  initialData,
  enabled = true,
}: {
  wsId: string;
  formId: string;
  initialData: FormAnalytics;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['forms', wsId, formId, 'analytics'],
    queryFn: async () =>
      apiFetch<{ analytics: FormAnalytics }>(
        `/api/v1/workspaces/${wsId}/forms/${formId}/analytics`,
        {
          cache: 'no-store',
        }
      ).then((result) => result.analytics),
    initialData,
    enabled: enabled && !!formId,
  });
}

export function useClearFormResponsesMutation({
  wsId,
  formId,
}: {
  wsId: string;
  formId: string;
}) {
  const t = useTranslations('forms');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      apiFetch<{ ok: true; deletedCount: number }>(
        `/api/v1/workspaces/${wsId}/forms/${formId}/responses`,
        {
          method: 'DELETE',
          cache: 'no-store',
        }
      ),
    onSuccess: () => {
      queryClient.setQueryData(['forms', wsId, formId, 'responses'], {
        total: 0,
        records: [],
        summary: {
          totalSubmissions: 0,
          totalResponders: 0,
          authenticatedResponders: 0,
          anonymousSubmissions: 0,
          duplicateAuthenticatedResponders: 0,
          duplicateAuthenticatedSubmissions: 0,
          hasMultipleSubmissionsByUser: false,
        },
        questionAnalytics: [],
      });
      queryClient.invalidateQueries({
        queryKey: ['forms', wsId, formId, 'responses'],
      });
      queryClient.invalidateQueries({ queryKey: ['forms', wsId] });
      queryClient.invalidateQueries({ queryKey: ['forms', wsId, formId] });
      toast.success(t('toast.responses_cleared'));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('toast.failed_to_clear_responses')
      );
    },
  });
}

export function useClearFormAnalyticsMutation({
  wsId,
  formId,
}: {
  wsId: string;
  formId: string;
}) {
  const t = useTranslations('forms');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      apiFetch<{ ok: true; deletedCount: number }>(
        `/api/v1/workspaces/${wsId}/forms/${formId}/analytics`,
        {
          method: 'DELETE',
          cache: 'no-store',
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['forms', wsId, formId, 'analytics'],
      });
      queryClient.invalidateQueries({ queryKey: ['forms', wsId] });
      queryClient.invalidateQueries({ queryKey: ['forms', wsId, formId] });
      toast.success(t('toast.analytics_cleared'));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('toast.failed_to_clear_analytics')
      );
    },
  });
}
