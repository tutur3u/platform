'use client';

import { useTranslations } from 'next-intl';

export interface GroupAttendanceSnapshot {
  available: boolean;
  attended: number;
  absent: number;
  count: number;
}

const GroupAttendanceStats = ({
  snapshot,
}: {
  snapshot?: GroupAttendanceSnapshot;
}) => {
  const t = useTranslations();

  const available = snapshot?.available ?? false;
  const attended = snapshot?.attended ?? 0;
  const absent = snapshot?.absent ?? 0;
  const count = snapshot?.count ?? 0;

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-1 rounded border p-2 text-center font-semibold ${
        available
          ? count <= attended + absent
            ? 'border-dynamic-green/10 bg-dynamic-green/10 text-dynamic-green'
            : 'border-dynamic-red/10 bg-dynamic-red/10 text-dynamic-red'
          : 'border-dynamic-purple/10 bg-dynamic-purple/10 text-dynamic-purple'
      }`}
    >
      {available
        ? count <= attended + absent
          ? t('user-group-data-table.completed')
          : t('user-group-data-table.incomplete')
        : t('user-group-data-table.no_attendance_today')}
      {available && (
        <span className="opacity-50">
          ({attended + absent}/{count})
        </span>
      )}
    </div>
  );
};

export default GroupAttendanceStats;
