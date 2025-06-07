import { WorkspaceCourse } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';

interface CourseCardViewProps {
  courses: (WorkspaceCourse & { ws_id: string; href: string; modules: number })[];
}

export function CourseCardView({ courses }: CourseCardViewProps) {
  if (courses.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No courses found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        <Link key={course.id} href={course.href}>
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">{course.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {course.description && (
                <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                  {course.description}
                </p>
              )}
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{course.modules || 0} modules</Badge>
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
