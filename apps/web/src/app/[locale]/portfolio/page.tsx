import { createLocalizedMarketingMetadata } from '@tuturuuu/utils/common/metadata';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import { getLocale, getMessages } from 'next-intl/server';
import type { CapabilityCopy } from '@/components/capabilities/product-scenes';
import type { VisualCopy } from '@/components/pitch/diagram-primitives';
import {
  Portfolio,
  type PortfolioCopy,
} from '@/components/portfolio/portfolio';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'portfolio',
  pathname: '/portfolio',
});

export default async function PortfolioPage() {
  const messages = await getMessages();
  const locale = await getLocale();
  const copy = messages.portfolio as PortfolioCopy;
  const apps = LAUNCHABLE_APPS.map((app) => ({
    slug: app.slug,
    title: app.title,
    category: app.category,
    url: app.productionUrl,
    description:
      copy.directory[app.slug as keyof typeof copy.directory].description,
  }));
  return (
    <Portfolio
      copy={copy}
      visuals={(messages.pitch as { visuals: VisualCopy }).visuals}
      capabilities={messages.capabilities as CapabilityCopy}
      apps={apps}
      locale={locale}
    />
  );
}
