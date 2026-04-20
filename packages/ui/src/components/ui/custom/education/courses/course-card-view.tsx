'use client';

import {
  ArrowUpRight,
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
  WandSparkles,
} from '@tuturuuu/icons';
import type { WorkspaceCourse } from '@tuturuuu/types';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
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
    WandSparkles,
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
      <div className="flex min-h-80 flex-col items-center justify-center rounded-[1.75rem] border border-border/70 border-dashed bg-background/60 px-6 py-12 text-center">
        <div className="mb-5 flex h-18 w-18 items-center justify-center rounded-[1.5rem] border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/15 to-dynamic-purple/10 shadow-sm">
          <BookOpen className="h-8 w-8 text-dynamic-blue" />
        </div>
        <p className="font-semibold text-lg">
          {t('ws-courses.no_courses_found')}
        </p>
        <p className="mt-2 max-w-md text-foreground/65 leading-6">
          {t('ws-courses.no_courses_found_description')}
        </p>
      </div>
    );
  }

  const courseStyles = [
    {
      cover:
        'from-dynamic-blue/18 via-dynamic-blue/8 to-background dark:to-background',
      iconSurface: 'border-dynamic-blue/20 bg-background/75 text-dynamic-blue',
      pill: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
      badge: 'border-dynamic-cyan/20 bg-dynamic-cyan/10 text-dynamic-cyan',
    },
    {
      cover:
        'from-dynamic-purple/18 via-dynamic-purple/8 to-background dark:to-background',
      iconSurface:
        'border-dynamic-purple/20 bg-background/75 text-dynamic-purple',
      pill: 'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
      badge: 'border-dynamic-pink/20 bg-dynamic-pink/10 text-dynamic-pink',
    },
    {
      cover:
        'from-dynamic-pink/16 via-dynamic-pink/8 to-background dark:to-background',
      iconSurface: 'border-dynamic-pink/20 bg-background/75 text-dynamic-pink',
      pill: 'border-dynamic-pink/20 bg-dynamic-pink/10 text-dynamic-pink',
      badge:
        'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
    },
    {
      cover:
        'from-dynamic-green/16 via-dynamic-green/8 to-background dark:to-background',
      iconSurface:
        'border-dynamic-green/20 bg-background/75 text-dynamic-green',
      pill: 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
      badge: 'border-dynamic-lime/20 bg-dynamic-lime/10 text-dynamic-lime',
    },
    {
      cover:
        'from-dynamic-orange/16 via-dynamic-orange/8 to-background dark:to-background',
      iconSurface:
        'border-dynamic-orange/20 bg-background/75 text-dynamic-orange',
      pill: 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
      badge:
        'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
    },
    {
      cover:
        'from-dynamic-indigo/16 via-dynamic-indigo/8 to-background dark:to-background',
      iconSurface:
        'border-dynamic-indigo/20 bg-background/75 text-dynamic-indigo',
      pill: 'border-dynamic-indigo/20 bg-dynamic-indigo/10 text-dynamic-indigo',
      badge:
        'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
    },
  ] as const;

  const formatModulesLabel = (count: number) => {
    const safeCount = count || 0;
    return `${safeCount} ${t('course-data-table.modules')}`;
  };

  return (
    <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((course, index) => {
        const style =
          courseStyles[index % courseStyles.length] || courseStyles[0];
        const IconComponent = getIconForCourse(course.id);

        return (
          <Link
            key={course.id}
            href={course.href}
            className="group block h-full"
          >
            <Card className="relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border/65 bg-card/95 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-foreground/10 hover:shadow-xl">
              <div
                className={cn(
                  'relative overflow-hidden border-border/40 border-b bg-gradient-to-br px-5 py-5 sm:px-6 sm:py-6',
                  style.cover
                )}
              >
                <div className="absolute -top-8 right-0 h-28 w-28 rounded-full bg-background/55 blur-3xl" />
                <div className="absolute bottom-0 left-0 h-20 w-full bg-gradient-to-t from-background/40 to-transparent" />
                <div className="relative flex items-start justify-between gap-4">
                  <div
                    className={cn(
                      'flex h-18 w-18 items-center justify-center rounded-[1.4rem] border shadow-sm backdrop-blur-md transition-transform duration-300 group-hover:scale-105',
                      style.iconSurface
                    )}
                  >
                    <IconComponent className="h-9 w-9" />
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div
                      className={cn(
                        'inline-flex items-center rounded-full border px-3 py-1 font-medium text-xs',
                        style.pill
                      )}
                    >
                      {formatModulesLabel(course.modules || 0)}
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-foreground/75 text-xs shadow-sm backdrop-blur-sm">
                      <Star className="h-3.5 w-3.5 fill-dynamic-yellow text-dynamic-yellow" />
                      <span className="font-semibold text-foreground">4.5</span>
                      <span>(123)</span>
                    </div>
                  </div>
                </div>
              </div>

              <CardContent className="flex flex-1 flex-col gap-5 p-5 pt-5 sm:p-6 sm:pt-6">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-2 flex-1 font-semibold text-xl leading-tight tracking-tight">
                      {course.name}
                    </h3>
                    <div
                      className={cn(
                        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-medium text-[11px] uppercase tracking-[0.18em]',
                        style.badge
                      )}
                    >
                      {t('ws-courses.singular')}
                    </div>
                  </div>

                  <p className="line-clamp-3 min-h-[4.5rem] text-[0.95rem] text-foreground/68 leading-6">
                    {course.description ||
                      t('ws-courses.no_description_provided')}
                  </p>
                </div>

                <div className="mt-auto space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/60 bg-background/65 px-3.5 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-foreground/75">
                        <Layers className="h-4 w-4" />
                        <span className="font-medium text-sm">
                          {formatModulesLabel(course.modules || 0)}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-background/65 px-3.5 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-foreground/75">
                        <Clock className="h-4 w-4" />
                        <span className="font-medium text-sm">
                          {t('ws-courses.self_paced')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-border/50 border-t pt-1">
                    <div className="text-[0.8rem] text-foreground/55 uppercase tracking-[0.22em]">
                      {course.id.slice(0, 8)}
                    </div>
                    <div className="inline-flex items-center gap-1.5 font-medium text-foreground/70 text-sm transition-colors group-hover:text-foreground">
                      <span>{t('ws-courses.table_view')}</span>
                      <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
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
