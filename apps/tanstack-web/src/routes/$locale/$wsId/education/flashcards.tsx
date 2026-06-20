import { createFileRoute, redirect } from '@tanstack/react-router';
import { educationLibraryRedirectHref } from '../../../../lib/platform/redirects';

export const Route = createFileRoute('/$locale/$wsId/education/flashcards')({
  loader: ({ params }) => {
    throw redirect({
      href: educationLibraryRedirectHref(params.wsId, 'flashcards'),
      statusCode: 308,
    });
  },
});
