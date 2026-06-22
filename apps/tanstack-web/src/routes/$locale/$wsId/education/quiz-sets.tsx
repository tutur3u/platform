import { createFileRoute, redirect } from '@tanstack/react-router';
import { educationLibraryRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/education/quiz-sets')({
  loader: ({ params }) => {
    throw redirect({
      href: educationLibraryRedirectHref(params.wsId, 'quiz-sets'),
      statusCode: 308,
    });
  },
});
