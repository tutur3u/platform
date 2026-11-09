import { supportedLocales } from '@/i18n/routing';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

interface Props {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.women_in_tech',
  pathname: '/women-in-tech',
  image: '/media/marketing/events/women-in-tech/og.jpg',
});

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default function WomenInTechLayout({ children }: Props) {
  return <>{children}</>;
}
