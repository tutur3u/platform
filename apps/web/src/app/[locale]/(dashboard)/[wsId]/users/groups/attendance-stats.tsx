'use client';

import { createClient } from '@/utils/supabase/client';
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
    const supabase = createClient();
    const date = new Date().toISOString();

    try {
      const { data } = await supabase
        .from('user_group_attendance')
        .select('*')
        .eq('group_id', groupId)
        .eq('date', date);

      const { data: classData } = await supabase
        .from('workspace_user_groups')
        .select('id')
        .eq('id', groupId)
        .contains('sessions', [date])
        .maybeSingle();

      return {
        data,
        available: !!classData,
      };
    } catch (e) {
      console.error(e);
      return {
        data: [],
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
      <div className="border-foreground/10 bg-foreground/10 text-foreground flex items-center justify-center rounded border p-2 text-center font-semibold">
        {t('common.loading')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-dynamic-red/10 bg-dynamic-red/10 text-dynamic-red flex items-center justify-center rounded border p-2 text-center font-semibold">
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
