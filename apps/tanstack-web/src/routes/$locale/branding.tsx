import { createFileRoute } from '@tanstack/react-router';
import { BrandingPage } from '../../components/branding/branding-page';
import { createPageHead } from '../../lib/platform/head';

const metadataByLocale = {
  en: {
    title: 'Tuturuuu brand guidelines and assets',
    description:
      'Download Tuturuuu brand assets, product marks, colors, typography guidance, and usage rules for consistent brand applications.',
    keywords:
      'Tuturuuu brand guidelines, Tuturuuu logo, Tuturuuu brand assets, Mira AI logo, Tuturuuu media kit',
  },
  vi: {
    title: 'Bo nhan dien va tai nguyen thuong hieu Tuturuuu',
    description:
      'Tai tai nguyen thuong hieu Tuturuuu, logo san pham, bang mau, quy chuan chu va huong dan su dung nhat quan.',
    keywords:
      'bo nhan dien Tuturuuu, logo Tuturuuu, tai nguyen thuong hieu Tuturuuu, logo Mira AI, media kit Tuturuuu',
  },
} as const;

export const Route = createFileRoute('/$locale/branding')({
  component: BrandingRoutePage,
  head: () => {
    const copy = metadataByLocale.en;

    return createPageHead(
      {
        canonicalUrl: '/en/branding',
        description: copy.description,
        imageUrl: '/en/branding/opengraph-image',
        locale: 'en',
        title: copy.title,
      },
      {
        alternates: {
          en: '/en/branding',
          vi: '/vi/branding',
        },
        meta: [
          { content: copy.keywords, name: 'keywords' },
          { content: 'website', property: 'og:type' },
          { content: 'summary_large_image', name: 'twitter:card' },
          { content: '@tuturuuu', name: 'twitter:creator' },
        ],
      }
    );
  },
});

function BrandingRoutePage() {
  return <BrandingPage />;
}
