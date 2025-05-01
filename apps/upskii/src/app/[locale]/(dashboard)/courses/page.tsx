'use client';
import { useEffect, useState } from 'react';
import { getWorkspaceCourseColumns } from './columns';
import CourseForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';

interface Course {
  id: string;
  name: string;
  ws_id: string;
  modules: number;
  href: string;
}

interface Props {
  wsId: string;
}

export default function WorkspaceCoursesPage({ wsId }: Props) {
  const t = useTranslations();
  const [data, setData] = useState<Course[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/${wsId}/courses`);  
        const json = await res.json();
        setData(json.data || []);
        setCount(json.count || 0);
      } catch (err) {
        console.error('Failed to fetch courses:', err);
      }
    };

    fetchData();
  }, [wsId]);

  const courses = data.map((c) => ({
    ...c,
    ws_id: wsId,
    href: `/${wsId}/courses/${c.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-courses.plural')}
        singularTitle={t('ws-courses.singular')}
        description={t('ws-courses.description')}
        createTitle={t('ws-courses.create')}
        createDescription={t('ws-courses.create_description')}
        form={<CourseForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={courses}
        columnGenerator={getWorkspaceCourseColumns}
        namespace="course-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}
