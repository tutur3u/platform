import { createFileRoute, redirect } from '@tanstack/react-router';
import { courseBuilderRedirectHref } from '../../../../../lib/platform/redirects';

export const Route = createFileRoute(
  '/$locale/$wsId/education/courses/$courseId'
)({
  loader: ({ params }) => {
    throw redirect({
      href: courseBuilderRedirectHref(params.wsId, params.courseId),
      statusCode: 308,
    });
  },
});
