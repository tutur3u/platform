'use client';

import { createClient } from '@/utils/supabase/client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const GroupAttendanceStats = async ({
  groupId,
  count,
}: {
  groupId: string;
  count: number;
}) => {
  const t = useTranslations();

  const [res, setRes] = useState<{
    completed: boolean;
    data:
      | {
          status: string;
        }[]
      | null;
    available: boolean;
  }>({
    completed: false,
    data: [],
    available: false,
  });

  useEffect(() => {
    if (!res.completed) {
      fetchAttendance(groupId).then((data) =>
        setRes({
          completed: true,
          ...data,
        })
      );
    }
  }, [groupId, res.completed]);

  const attended =
    res.data?.reduce((a, b) => a + (b?.status === 'PRESENT' ? 1 : 0), 0) || 0;

  const absent =
    res.data?.reduce((a, b) => a + (b?.status === 'ABSENT' ? 1 : 0), 0) || 0;

  return (
    <div
      className={`flex items-center justify-center rounded border p-2 text-center font-semibold ${
        res.available
          ? count <= attended + absent
            ? 'border-dynamic-green/10 bg-dynamic-green/10 text-dynamic-green'
            : 'border-dynamic-red/10 bg-dynamic-red/10 text-dynamic-red'
          : 'border-dynamic-purple/10 bg-dynamic-purple/10 text-dynamic-purple'
      }`}
    >
      {res.available
        ? count <= attended + absent
          ? t('user-group-data-table.completed')
          : t('user-group-data-table.incomplete')
        : t('user-group-data-table.no_attendance_today')}{' '}
      {res.available && (
        <span className="opacity-50">
          ({attended + absent}/{count})
        </span>
      )}
    </div>
  );
};

const fetchAttendance = async (groupId: string) => {
  const sbAdmin = createClient();
  const date = new Date().toISOString();

  try {
    const { data } = await sbAdmin
      .from('user_group_attendance')
      .select('*')
      .eq('group_id', groupId)
      .eq('date', date);

    const { data: classData } = await sbAdmin
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

export default GroupAttendanceStats;
