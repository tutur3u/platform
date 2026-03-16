'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

const GroupAttendanceStats = ({
  wsId,
  groupId,
  count,
}: {
  wsId: string | undefined;
  groupId: string;
  count: number;
}) => {
  const t = useTranslations();

  const fetchAttendance = async () => {
    const today = new Date().toISOString().split('T')[0];
    if (!today) return { data: [], available: false };

    try {
      const attRes = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/attendance?date=${today}`,
        { cache: 'no-store' }
      );
      if (!attRes.ok) throw new Error('Failed to fetch attendance');
      const data = await attRes.json();

      const groupRes = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}`,
        { cache: 'no-store' }
      );
      if (!groupRes.ok) throw new Error('Failed to fetch group details');
      const { data: groupData } = await groupRes.json();

      const sessions = (groupData?.sessions || []) as (string | undefined)[];
      const available = sessions.some(
        (s) => typeof s === 'string' && s.startsWith(today)
      );

      return {
        data: data as Array<{ status: string }>,
        available,
      };
    } catch (e) {
      console.error(e);
      return {
        data: [] as Array<{ status: string }>,
        available: false,
      };
    }
  };

  const {
    data: res,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      'workspaces',
      wsId,
      'users',
      'groups',
      groupId,
      'attendance',
      'today',
    ],
    queryFn: fetchAttendance,
    placeholderData: keepPreviousData,
    enabled: !!groupId,
  });

  if (!wsId || !groupId) return null;

  const attended =
    res?.data?.reduce((a, b) => a + (b?.status === 'PRESENT' ? 1 : 0), 0) || 0;

  const absent =
    res?.data?.reduce((a, b) => a + (b?.status === 'ABSENT' ? 1 : 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded border border-foreground/10 bg-foreground/10 p-2 text-center font-semibold text-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center rounded border border-dynamic-red/10 bg-dynamic-red/10 p-2 text-center font-semibold text-dynamic-red">
        {t('common.error')}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-1 rounded border p-2 text-center font-semibold ${
        res?.available
          ? count <= attended + absent
            ? 'border-dynamic-green/10 bg-dynamic-green/10 text-dynamic-green'
            : 'border-dynamic-red/10 bg-dynamic-red/10 text-dynamic-red'
          : 'border-dynamic-purple/10 bg-dynamic-purple/10 text-dynamic-purple'
      }`}
    >
      {res?.available
        ? count <= attended + absent
          ? t('user-group-data-table.completed')
          : t('user-group-data-table.incomplete')
        : t('user-group-data-table.no_attendance_today')}
      {res?.available && (
        <span className="opacity-50">
          ({attended + absent}/{count})
        </span>
      )}
    </div>
  );
};

export default GroupAttendanceStats;
