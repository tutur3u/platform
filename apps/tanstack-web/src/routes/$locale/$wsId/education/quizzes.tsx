import { createFileRoute, redirect } from '@tanstack/react-router';
import { educationLibraryRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/education/quizzes')({
  loader: ({ params }) => {
    throw redirect({
      href: educationLibraryRedirectHref(params.wsId, 'quizzes'),
      statusCode: 308,
    });
  },
});
