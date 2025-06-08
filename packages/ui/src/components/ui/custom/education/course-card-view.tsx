'use client';

import type { WorkspaceCourse } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { BookOpen, Layers } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface CourseCardViewProps {
  courses: (WorkspaceCourse & {
    ws_id: string;
    href: string;
    modules: number;
  })[];
}

export function CourseCardView({ courses }: CourseCardViewProps) {
  const t = useTranslations();

  if (courses.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-blue-100">
          <BookOpen className="h-8 w-8 text-purple-600" />
        </div>
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {t('no-courses-found')}
        </p>
      </div>
    );
  }

  const gradients = [
    'from-purple-500 to-pink-500',
    'from-blue-500 to-cyan-500',
    'from-green-500 to-teal-500',
    'from-orange-500 to-red-500',
    'from-indigo-500 to-purple-500',
    'from-pink-500 to-rose-500',
  ];

  return (
    <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((course, index) => {
        const gradient = gradients[index % gradients.length];

        return (
          <Link key={course.id} href={course.href} className="group h-full">
            <Card className="relative h-full overflow-hidden border-0 bg-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:bg-gray-900">
              {/* Gradient Header */}
              <div className={`h-0.5 bg-gradient-to-r ${gradient}`} />

              {/* Decorative Background Pattern */}
              <div className="absolute inset-0 opacity-5">
                <div
                  className={`h-full w-full bg-gradient-to-br ${gradient}`}
                />
              </div>

              <CardHeader className="relative pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl font-bold text-gray-900 group-hover:text-gray-700 dark:text-gray-100 dark:group-hover:text-gray-300">
                      {course.name}
                    </CardTitle>
                  </div>
                  <div
                    className={`rounded-full bg-gradient-to-br p-2 ${gradient} shadow-lg`}
                  >
                    <BookOpen className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="relative flex min-h-[140px] flex-1 flex-col">
                <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {course.description || t('ws-courses.no_description_provided')}
                </p>

                <div className="mt-auto space-y-3">
                  {/* Modules Badge */}
                  <div className="flex items-center gap-2">
                    <div
                      className={`rounded-full bg-gradient-to-br p-1.5 ${gradient} shadow-sm`}
                    >
                      <Layers className="h-3 w-3 text-white" />
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                    >
                      {course.modules || 0} {t('course-data-table.modules')}
                    </Badge>
                  </div>

                  {/* Date */}
                  {/* <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>
                      Created {new Date(course.created_at).toLocaleDateString()}
                    </span>
                  </div> */}
                </div>

                {/* Hover Effect Overlay
                <div
                  className={`absolute inset-0 bg-gradient-to-br opacity-0 ${gradient} rounded-lg transition-opacity duration-300 group-hover:opacity-5`}
                /> */}
              </CardContent>

              {/* Bottom Accent Line
              <div
                className={`h-1 bg-gradient-to-r ${gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
              /> */}
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
