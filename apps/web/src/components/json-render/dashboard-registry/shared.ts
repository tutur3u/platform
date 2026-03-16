'use client';

import { useStateStore, useStateValue } from '@json-render/react';
import { useMutation } from '@tanstack/react-query';
import type { JsonRenderMultiQuizItem } from '@tuturuuu/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { uploadToStorageUrl } from '@/lib/api-fetch';

export const SignedUploadResponseSchema = z.object({
  uploads: z.array(
    z.object({
      filename: z.string(),
      signedUrl: z.string(),
      token: z.string(),
      path: z.string(),
    })
  ),
});

const MAX_FILES_PER_REQUEST = 5;
const SIGNED_UPLOAD_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;

function isValidSignedUploadPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    SIGNED_UPLOAD_PATH_PATTERN.test(path) &&
    !path.includes('..')
  );
}

export type CreateTransactionInput = {
  amount: number;
  description: string;
  walletId: string;
};

export function useCreateTransaction() {
  return useMutation<void, Error, CreateTransactionInput>({
    mutationFn: async (params) => {
      const res = await fetch('/api/v1/finance/transactions', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: params.amount,
          description: params.description,
          wallet_id: params.walletId,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to log transaction');
      }
    },
  });
}

type CreateTimeTrackingRequestInput = Record<string, unknown>;

export type CreateTimeTrackingRequestSuccess = {
  success: true;
  request: {
    id: string;
    workspaceId: string;
  };
  title: string;
  description: string;
  imagePaths: string[];
};

export type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

export type StatDisplayProps = {
  label?: string;
  value?: string | number;
  icon?: string;
  variant?: 'success' | 'warning' | 'error' | string;
};

export type MultiQuizItem = JsonRenderMultiQuizItem;

export const useComponentValue = <T>(
  propValue: T | undefined,
  bindingPath: string | undefined,
  fallbackName: string | undefined,
  defaultValue: T
): [T, (val: T) => void] => {
  const { set } = useStateStore();

  const fallbackPath = fallbackName ? `/${fallbackName}` : undefined;
  const path = bindingPath || fallbackPath;
  const safePath = path || '/__json_render_unbound__';
  const boundValue = useStateValue<T>(safePath);
  const stableDefault = useRef(defaultValue);
  const [localValue, setLocalValue] = useState<T>(
    (propValue ?? stableDefault.current) as T
  );

  useEffect(() => {
    if (!path) {
      setLocalValue((propValue ?? stableDefault.current) as T);
    }
  }, [path, propValue]);

  const setValue = useCallback(
    (val: T) => {
      if (path) {
        set(path, val);
      } else {
        setLocalValue(val);
      }
    },
    [path, set]
  );

  if (!path) return [localValue, setValue];
  return [(boundValue ?? propValue ?? stableDefault.current) as T, setValue];
};

export function formatDurationLabel(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function resolveStatsRange(
  period?: string,
  dateFrom?: string,
  dateTo?: string
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  const setStartOfDay = (date: Date) => date.setHours(0, 0, 0, 0);
  const setEndOfDay = (date: Date) => date.setHours(23, 59, 59, 999);

  switch (period) {
    case 'today': {
      setStartOfDay(start);
      setEndOfDay(end);
      return { from: start, to: end, label: 'Today' };
    }
    case 'this_week': {
      const day = start.getDay();
      const daysToSubtract = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - daysToSubtract);
      setStartOfDay(start);
      setEndOfDay(end);
      return { from: start, to: end, label: 'This week' };
    }
    case 'this_month': {
      start.setDate(1);
      setStartOfDay(start);
      setEndOfDay(end);
      return { from: start, to: end, label: 'This month' };
    }
    case 'last_30_days': {
      start.setDate(start.getDate() - 29);
      setStartOfDay(start);
      setEndOfDay(end);
      return { from: start, to: end, label: 'Last 30 days' };
    }
    case 'custom': {
      const parsedFrom = dateFrom ? new Date(dateFrom) : null;
      const parsedTo = dateTo ? new Date(dateTo) : null;
      if (
        parsedFrom &&
        parsedTo &&
        !Number.isNaN(parsedFrom.getTime()) &&
        !Number.isNaN(parsedTo.getTime())
      ) {
        return {
          from: parsedFrom,
          to: parsedTo,
          label: 'Custom range',
        };
      }
      start.setDate(start.getDate() - 6);
      setStartOfDay(start);
      setEndOfDay(end);
      return { from: start, to: end, label: 'Last 7 days' };
    }
    default: {
      start.setDate(start.getDate() - 6);
      setStartOfDay(start);
      setEndOfDay(end);
      return { from: start, to: end, label: 'Last 7 days' };
    }
  }
}

export function collectFilesFromValue(value: unknown): File[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is File => item instanceof File);
}

export function normalizeIsoDateTimeInput(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();

  const isValidCalendarDate = (datePart: string): boolean => {
    const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;

    const [, yearString, monthString, dayString] = match;
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);

    if (month < 1 || month > 12 || day < 1) return false;

    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day <= maxDay;
  };

  const leadingDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/)?.[1];
  if (leadingDate && !isValidCalendarDate(leadingDate)) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const dateTimeWithSpaceMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
  );
  if (dateTimeWithSpaceMatch) {
    const [, datePart, hours, minutes, seconds = '00'] = dateTimeWithSpaceMatch;
    if (!datePart) return null;
    if (!isValidCalendarDate(datePart)) return null;

    const normalized = new Date(`${datePart}T${hours}:${minutes}:${seconds}`);
    if (!Number.isNaN(normalized.getTime())) {
      return normalized.toISOString();
    }
  }

  return null;
}

export function resolveTimeTrackingRequestDescription(
  params: Record<string, unknown>
): string {
  if (typeof params.description === 'string') return params.description;

  const values = params.values;
  if (
    values &&
    typeof values === 'object' &&
    typeof (values as Record<string, unknown>).description === 'string'
  ) {
    return (values as Record<string, unknown>).description as string;
  }

  if (typeof params.details === 'string') return params.details;

  return '';
}

export function shouldUseTimeTrackingRequestAction(
  explicitAction: string | undefined,
  values: Record<string, unknown>,
  submitParams: Record<string, unknown>
): boolean {
  if (explicitAction === 'create_time_tracking_request') return true;
  if (explicitAction && explicitAction !== 'submit_form') return false;

  const merged = { ...submitParams, ...values };
  const hasStartTime = typeof merged.startTime === 'string';
  const hasEndTime = typeof merged.endTime === 'string';
  const hasTitle =
    typeof merged.title === 'string' && merged.title.trim().length > 0;
  const hasEvidence =
    collectFilesFromValue(merged.evidence).length > 0 ||
    collectFilesFromValue(merged.attachments).length > 0 ||
    (Array.isArray(merged.imagePaths) && merged.imagePaths.length > 0);

  return hasStartTime && hasEndTime && (hasTitle || hasEvidence);
}

export function useCreateTimeTrackingRequest() {
  return useMutation<
    CreateTimeTrackingRequestSuccess,
    Error,
    CreateTimeTrackingRequestInput
  >({
    mutationFn: async (params) => {
      const wsId = typeof params.wsId === 'string' ? params.wsId : undefined;
      if (!wsId) {
        throw new Error('Workspace ID is required');
      }

      const title =
        typeof params.title === 'string' && params.title.trim()
          ? params.title.trim()
          : undefined;
      if (!title) {
        throw new Error('Title is required');
      }

      const startTime = normalizeIsoDateTimeInput(params.startTime);
      const endTime = normalizeIsoDateTimeInput(params.endTime);
      if (!startTime || !endTime) {
        throw new Error(
          'startTime and endTime are required and must be valid date/time values'
        );
      }

      const description = resolveTimeTrackingRequestDescription(params);

      const requestId =
        typeof params.requestId === 'string' && params.requestId
          ? params.requestId
          : crypto.randomUUID();

      const rawEvidence = params.evidence;
      const rawAttachments = params.attachments;
      const files = [
        ...collectFilesFromValue(rawEvidence),
        ...collectFilesFromValue(rawAttachments),
      ].slice(0, MAX_FILES_PER_REQUEST);

      const preUploadedPaths = Array.isArray(params.imagePaths)
        ? params.imagePaths.filter((path): path is string =>
            isValidSignedUploadPath(path)
          )
        : [];

      let uploadedPaths: string[] = [];
      if (files.length > 0) {
        const uploadUrlRes = await fetch(
          `/api/v1/workspaces/${encodeURIComponent(wsId)}/time-tracking/requests/upload-url`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestId,
              files: files.map((file) => ({ filename: file.name })),
            }),
          }
        );

        const uploadUrlBody = await uploadUrlRes.json().catch(() => ({}));

        if (!uploadUrlRes.ok) {
          throw new Error(
            (uploadUrlBody as { error?: string }).error ||
              'Failed to prepare file upload'
          );
        }

        const uploadData = SignedUploadResponseSchema.parse(uploadUrlBody);
        if (uploadData.uploads.length !== files.length) {
          throw new Error('Upload URL response is invalid');
        }

        await Promise.all(
          uploadData.uploads.map(async (upload, index) => {
            const file = files[index];
            if (!file) return;

            await uploadToStorageUrl(upload.signedUrl, file, upload.token);
          })
        );

        uploadedPaths = uploadData.uploads
          .map((upload) => upload.path)
          .filter((path) => isValidSignedUploadPath(path));
      }

      const imagePaths = [...preUploadedPaths, ...uploadedPaths].slice(
        0,
        MAX_FILES_PER_REQUEST
      );

      if (imagePaths.length === 0) {
        throw new Error(
          'Please attach at least one evidence image before submitting'
        );
      }

      const response = await fetch(
        `/api/v1/workspaces/${encodeURIComponent(wsId)}/time-tracking/requests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            title,
            description,
            categoryId:
              typeof params.categoryId === 'string' ? params.categoryId : '',
            taskId: typeof params.taskId === 'string' ? params.taskId : '',
            startTime,
            endTime,
            imagePaths,
          }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ||
            'Failed to submit time tracking request'
        );
      }

      const responseBody = (await response.json().catch(() => null)) as {
        success?: boolean;
        request?: {
          id?: string;
          workspace_id?: string;
        };
      } | null;

      if (!responseBody?.success || !responseBody?.request?.id) {
        throw new Error(
          'Request submission response was incomplete. Please try again.'
        );
      }

      return {
        success: true,
        request: {
          id: responseBody.request.id,
          workspaceId: responseBody.request.workspace_id || wsId,
        },
        title,
        description,
        imagePaths,
      };
    },
  });
}
