import { createFileRoute } from '@tanstack/react-router';
import { BlogPage } from '../../components/blog/blog-page';
import { createPageHead } from '../../lib/platform/head';

const metadataByLocale = {
  en: {
    title: 'Tuturuuu Blog',
    description:
      'Insights and stories about productivity, AI, and modern teamwork from Tuturuuu.',
  },
  vi: {
    title: 'Blog Tuturuuu',
    description:
      'Bai viet va cau chuyen ve nang suat, AI va lam viec hien dai tu Tuturuuu.',
  },
} as const;

export const Route = createFileRoute('/$locale/blog')({
  component: BlogRoutePage,
  head: () => {
    const copy = metadataByLocale.en;

    return createPageHead(
      {
        canonicalUrl: '/en/blog',
        description: copy.description,
        locale: 'en',
        title: copy.title,
      },
      {
        alternates: {
          en: '/en/blog',
          vi: '/vi/blog',
        },
      }
    );
  },
});

function BlogRoutePage() {
  return <BlogPage />;
}
