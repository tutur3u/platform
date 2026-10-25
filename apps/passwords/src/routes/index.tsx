import { createFileRoute, redirect } from '@tanstack/react-router';
import { detectLocale } from '../service/functions';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    throw redirect({
      to: '/$locale',
      params: { locale: await detectLocale() },
    });
  },
});
