'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useRouter } from '../../../lib/platform/next-navigation-shim';
import { HOLIDAYS_MANAGEMENT_QUERY_KEY } from './query-keys';
import type {
  HolidayBulkImportValues,
  HolidaysActionResult,
  HolidayUpdateValues,
  HolidayWriteValues,
} from './types';

type UseHolidaysActionsProps = {
  bulkImportHolidays: (
    values: HolidayBulkImportValues
  ) => Promise<HolidaysActionResult>;
  createHoliday: (values: HolidayWriteValues) => Promise<HolidaysActionResult>;
  deleteHoliday: (holidayId: string) => Promise<HolidaysActionResult>;
  updateHoliday: (
    holidayId: string,
    values: HolidayUpdateValues
  ) => Promise<HolidaysActionResult>;
};

function assertActionResult(result: HolidaysActionResult) {
  if (!result.ok) {
    throw new Error(result.message);
  }

  return result;
}

export function useHolidaysActions({
  bulkImportHolidays,
  createHoliday,
  deleteHoliday,
  updateHoliday,
}: UseHolidaysActionsProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations('admin-holidays');

  const refreshRouteData = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: HOLIDAYS_MANAGEMENT_QUERY_KEY,
    });
    router.refresh();
  }, [queryClient, router]);

  const createMutation = useMutation({
    mutationFn: async (values: HolidayWriteValues) =>
      assertActionResult(await createHoliday(values)),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('fill_required_fields')
      );
    },
    onSuccess: async (result) => {
      toast.success(result.message || t('holiday_created'));
      await refreshRouteData();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      holidayId,
      values,
    }: {
      holidayId: string;
      values: HolidayUpdateValues;
    }) => assertActionResult(await updateHoliday(holidayId, values)),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('fill_required_fields')
      );
    },
    onSuccess: async (result) => {
      toast.success(result.message || t('holiday_updated'));
      await refreshRouteData();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (holidayId: string) =>
      assertActionResult(await deleteHoliday(holidayId)),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delete_holiday'));
    },
    onSuccess: async (result) => {
      toast.success(result.message || t('holiday_deleted'));
      await refreshRouteData();
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (values: HolidayBulkImportValues) =>
      assertActionResult(await bulkImportHolidays(values)),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('invalid_json'));
    },
    onSuccess: async (result) => {
      toast.success(
        result.message ||
          t('bulk_import_success', { count: result.imported ?? 0 })
      );
      await refreshRouteData();
    },
  });

  const handleCreate = useCallback(
    async (values: HolidayWriteValues) => {
      await createMutation.mutateAsync(values);
    },
    [createMutation]
  );

  const handleUpdate = useCallback(
    async (holidayId: string, values: HolidayUpdateValues) => {
      await updateMutation.mutateAsync({ holidayId, values });
    },
    [updateMutation]
  );

  const handleDelete = useCallback(
    async (holidayId: string) => {
      await deleteMutation.mutateAsync(holidayId);
    },
    [deleteMutation]
  );

  const handleBulkImport = useCallback(
    async (values: HolidayBulkImportValues) => {
      await bulkImportMutation.mutateAsync(values);
    },
    [bulkImportMutation]
  );

  return {
    bulkImportPending: bulkImportMutation.isPending,
    createPending: createMutation.isPending,
    handleBulkImport,
    handleCreate,
    handleDelete,
    handleUpdate,
    isMutating:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      bulkImportMutation.isPending,
  };
}
