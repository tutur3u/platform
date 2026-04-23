import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadSharedCourseContent } from '@/lib/share/load-shared-course';
import { ModuleViewer } from './module-viewer';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{
    moduleId: string;
    resourceId: string;
    type: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;

  if (type !== 'course') {
    return { title: 'Shared Content' };
  }

  return {
    title: 'Course Module',
    description: 'View shared course module content.',
  };
}

export default async function ShareModulePage({ params }: Props) {
  const { type, resourceId, moduleId } = await params;

  if (type !== 'course') notFound();

  const sharedCourse = await loadSharedCourseContent(resourceId);
  if (!sharedCourse) notFound();

  const moduleIndex = sharedCourse.modules.findIndex(
    (module) => module.id === moduleId
  );

  if (moduleIndex === -1) notFound();

  const module = sharedCourse.modules[moduleIndex];
  if (!module) notFound();

  const previousModuleId = sharedCourse.modules[moduleIndex - 1]?.id ?? null;
  const nextModuleId = sharedCourse.modules[moduleIndex + 1]?.id ?? null;

  return (
    <ModuleViewer
      group={sharedCourse.group}
      module={module}
      moduleIndex={moduleIndex + 1}
      totalModules={sharedCourse.modules.length}
      previousModuleId={previousModuleId}
      nextModuleId={nextModuleId}
    />
  );
}
