import { WorkspaceCourse } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
      <div className="py-8 text-center text-muted-foreground">
        {t('no-courses-found')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        <Link key={course.id} href={course.href} className="h-full">
          <Card className="flex h-full cursor-pointer flex-col transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{course.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-[120px] flex-1 flex-col">
              <p className="mb-2 line-clamp-3 text-sm text-balance text-muted-foreground">
                {course.description || t('no-description-provided')}
              </p>
              <div className="mt-auto flex items-center justify-between">
                <Badge variant="secondary">
                  {course.modules || 0} {t('course-data-table.modules')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(course.created_at).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
