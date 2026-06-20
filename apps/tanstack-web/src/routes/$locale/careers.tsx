import { createFileRoute } from '@tanstack/react-router';
import { CareersPage } from '../../components/careers/careers-page';
import { createPageHead } from '../../lib/platform/head';

const metadataByLocale = {
  en: {
    title: 'Careers at Tuturuuu',
    description:
      'Discover open roles and learn what it is like to build Tuturuuu.',
  },
  vi: {
    title: 'Co hoi nghe nghiep tai Tuturuuu',
    description: 'Kham pha co hoi va cach chung toi xay dung Tuturuuu.',
  },
} as const;

export const Route = createFileRoute('/$locale/careers')({
  component: CareersRoutePage,
  head: () => {
    const copy = metadataByLocale.en;

    return createPageHead(
      {
        canonicalUrl: '/en/careers',
        description: copy.description,
        locale: 'en',
        title: copy.title,
      },
      {
        alternates: {
          en: '/en/careers',
          vi: '/vi/careers',
        },
      }
    );
  },
});

function CareersRoutePage() {
  return <CareersPage />;
}
