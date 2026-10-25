import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/$locale/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$locale/$wsId',
      params: { locale: params.locale, wsId: 'personal' },
    });
  },
});
