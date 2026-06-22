import { createFileRoute } from '@tanstack/react-router';
import { PartnersPage } from '../../components/partners/partners-page';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/partners')({
  component: PartnersPage,
  head: () =>
    createPageHead(
      {
        description:
          'Collaborating with innovative organizations and communities to create meaningful impact and drive technological advancement together. Explore our partnerships across education, technology, innovation, and entrepreneurship.',
        title: 'Partners',
      },
      {
        meta: [
          { content: 'website', property: 'og:type' },
          { content: 'summary_large_image', name: 'twitter:card' },
          { content: 'Our Partners', name: 'twitter:title' },
          {
            content:
              'Collaborating with innovative organizations to create meaningful impact and drive technological advancement together.',
            name: 'twitter:description',
          },
        ],
      }
    ),
});
