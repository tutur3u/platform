'use client';

import type { WorkspaceCourseListItem } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';

export function CoursePicker({
  activeCourseId,
  courses,
  onChange,
}: {
  activeCourseId: string;
  courses: WorkspaceCourseListItem[];
  onChange: (courseId: string) => void;
}) {
  const t = useTranslations('teachOperations');

  return (
    <label className="grid gap-2">
      <span className="font-black text-sm">{t('course')}</span>
      <select
        className="h-11 border-2 border-border bg-background px-3 font-bold outline-none focus:border-primary"
        onChange={(event) => onChange(event.target.value)}
        value={activeCourseId}
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
          </option>
        ))}
      </select>
    </label>
  );
}
