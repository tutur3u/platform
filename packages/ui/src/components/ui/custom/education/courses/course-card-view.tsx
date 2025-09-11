'use client';

import type { WorkspaceCourse } from '@tuturuuu/types/db';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Beaker,
  BookOpen,
  Brain,
  Calculator,
  Camera,
  Clock,
  Code,
  Globe,
  GraduationCap,
  Layers,
  Microscope,
  Music,
  Palette,
  PenTool,
  Star,
} from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface CourseCardViewProps {
  courses: (WorkspaceCourse & {
    ws_id: string;
    href: string;
    modules: number;
  })[];
}

export function CourseCardView({ courses }: CourseCardViewProps) {
  const t = useTranslations();

  // Array of course icons for randomization
  const courseIcons = [
    BookOpen,
    GraduationCap,
    Brain,
    Code,
    Calculator,
    Globe,
    Palette,
    Music,
    Camera,
    Microscope,
    Beaker,
    PenTool,
  ] as const;

  // Function to get a consistent random icon for each course
  const getIconForCourse = (courseId: string) => {
    // Use course ID to generate a consistent hash for icon selection
    let hash = 0;
    for (let i = 0; i < courseId.length; i++) {
      const char = courseId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    const index = Math.abs(hash) % courseIcons.length;
    return courseIcons[index] || BookOpen; // Fallback to BookOpen if somehow undefined
  };

  if (courses.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-blue-100">
          <BookOpen className="h-8 w-8 text-purple-600" />
        </div>
        <p className="font-medium text-gray-900 text-lg dark:text-gray-100">
          {t('ws-courses.no_courses_found')}
        </p>
      </div>
    );
  }

  const courseStyles = [
    {
      bgColor: 'bg-blue-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      badgeColor: 'text-blue-600 bg-blue-600/10',
    },
    {
      bgColor: 'bg-purple-50',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      badgeColor: 'text-purple-600 bg-purple-600/10',
    },
    {
      bgColor: 'bg-pink-50',
      iconBg: 'bg-pink-100',
      iconColor: 'text-pink-600',
      badgeColor: 'text-pink-600 bg-pink-600/10',
    },
    {
      bgColor: 'bg-green-50',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      badgeColor: 'text-green-600 bg-green-600/10',
    },
    {
      bgColor: 'bg-orange-50',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      badgeColor: 'text-orange-600 bg-orange-600/10',
    },
    {
      bgColor: 'bg-indigo-50',
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      badgeColor: 'text-indigo-600 bg-indigo-600/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((course, index) => {
        const style =
          courseStyles[index % courseStyles.length] || courseStyles[0];

        // Get the icon component for this course
        const IconComponent = getIconForCourse(course.id);

        return (
          <Link key={course.id} href={course.href} className="group h-full">
            <Card className="flex h-full flex-col overflow-hidden bg-white shadow-md transition-transform hover:scale-105 dark:bg-foreground/5">
              {/* Top colored section with icon */}
              <div
                className={`${style?.bgColor} flex flex-shrink-0 items-center justify-center px-8 py-8`}
              >
                <div className={`${style?.iconBg} rounded-2xl p-4`}>
                  <IconComponent className={`h-12 w-12 ${style?.iconColor}`} />
                </div>
              </div>

              <CardContent className="flex flex-grow flex-col gap-4 p-6">
                {/* Category badge and title */}
                <div className="flex items-start justify-between">
                  <h3 className="line-clamp-2 flex-grow pr-2 font-semibold text-gray-900 text-lg leading-tight dark:text-gray-100">
                    {course.name}
                  </h3>
                  <div className="flex flex-shrink-0 items-center">
                    <Star className="mr-1 h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="mr-1 font-medium text-sm">4.5</span>
                    {/* TODO: Add rating if the schema supports later on*/}
                    <span className="font-light text-sm">(123)</span>
                    {/* TODO: Add number of reviews if the schema supports later on*/}
                  </div>
                </div>

                <p className="line-clamp-2 flex-grow text-gray-600 text-sm leading-relaxed dark:text-gray-400">
                  {course.description ||
                    t('ws-courses.no_description_provided')}
                </p>

                {/* Bottom section with modules info */}
                <div className="flex items-center justify-between text-gray-500 text-sm dark:text-gray-400">
                  <div className="flex items-center">
                    <Layers className="mr-1 h-4 w-4" />
                    <span>
                      {course.modules || 0} {t('course-data-table.modules')}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="mr-1 h-4 w-4" />
                    <span>{t('ws-courses.self_paced')}</span>{' '}
                    {/* TODO: Add duration if the schema supports later on*/}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
