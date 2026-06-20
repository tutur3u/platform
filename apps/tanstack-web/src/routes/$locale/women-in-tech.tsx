import { createFileRoute } from '@tanstack/react-router';
import {
  getWomenInTechMetadata,
  WomenInTechPage,
  womenInTechKeywords,
} from '../../components/women-in-tech';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

const ogImageUrl = '/media/marketing/events/women-in-tech/og.jpg';

export const Route = createFileRoute('/$locale/women-in-tech')({
  component: WomenInTechRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);
    const metadata = getWomenInTechMetadata(locale);

    return createPageHead(
      {
        canonicalUrl: `https://tuturuuu.com/${locale}/women-in-tech`,
        description: metadata.description,
        imageUrl: ogImageUrl,
        openGraphDescription: metadata.ogDescription,
        openGraphLocale: metadata.ogLocale,
        title: metadata.title,
      },
      {
        alternates: {
          'en-US': 'https://tuturuuu.com/en/women-in-tech',
          'vi-VN': 'https://tuturuuu.com/vi/women-in-tech',
        },
        meta: [
          { content: womenInTechKeywords.join(', '), name: 'keywords' },
          { content: 'website', property: 'og:type' },
          {
            content: metadata.alternateLocale,
            property: 'og:locale:alternate',
          },
          { content: 'Tuturuuu', property: 'og:site_name' },
          { content: '1200', property: 'og:image:width' },
          { content: '630', property: 'og:image:height' },
          { content: metadata.title, property: 'og:image:alt' },
          { content: 'summary_large_image', name: 'twitter:card' },
          { content: metadata.title, name: 'twitter:title' },
          {
            content: metadata.twitterDescription,
            name: 'twitter:description',
          },
          { content: ogImageUrl, name: 'twitter:image' },
        ],
      }
    );
  },
});

function WomenInTechRoutePage() {
  const { locale } = Route.useParams();

  return <WomenInTechPage locale={resolveMessagesLocale(locale)} />;
}
