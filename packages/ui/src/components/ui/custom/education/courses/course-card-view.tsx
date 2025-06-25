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
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
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
            <Card className="h-full overflow-hidden bg-white shadow-md transition-transform hover:scale-105 dark:bg-foreground/5 flex flex-col">
              {/* Top colored section with icon */}
              <div
                className={`${style?.bgColor} py-8 px-8 flex items-center justify-center flex-shrink-0`}
              >
                <div className={`${style?.iconBg} p-4 rounded-2xl`}>
                  <IconComponent className={`h-12 w-12 ${style?.iconColor}`} />
                </div>
              </div>

              <CardContent className="p-6 flex flex-col flex-grow gap-4">
                {/* Category badge and title */}
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 flex-grow pr-2 leading-tight">
                    {course.name}
                  </h3>
                  <div className="flex items-center flex-shrink-0">
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 mr-1" />
                    <span className="font-medium text-sm mr-1">4.5</span>
                    {/* TODO: Add rating if the schema supports later on*/}
                    <span className="font-light text-sm">(123)</span>
                    {/* TODO: Add number of reviews if the schema supports later on*/}
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2 flex-grow">
                  {course.description ||
                    t('ws-courses.no_description_provided')}
                </p>

                {/* Bottom section with modules info */}
                <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-sm">
                  <div className="flex items-center">
                    <Layers className="h-4 w-4 mr-1" />
                    <span>
                      {course.modules || 0} {t('course-data-table.modules')}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    <span>Self-paced</span>{' '}
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
