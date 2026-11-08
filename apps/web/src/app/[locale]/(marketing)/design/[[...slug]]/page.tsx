import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { componentDocs } from '../../../ui/component-docs';
import ComponentsPage, {
  generateMetadata as generateComponentsMetadata,
} from '../../../ui/components/page';
import ComponentPage, {
  generateMetadata as generateComponentMetadata,
} from '../../../ui/components/[componentId]/page';
import ContributingPage, {
  generateMetadata as generateContributingMetadata,
} from '../../../ui/contributing/page';
import OverviewPage, {
  generateMetadata as generateOverviewMetadata,
} from '../../../ui/page';
import SetupPage, {
  generateMetadata as generateSetupMetadata,
} from '../../../ui/setup/page';

interface Props {
  params: Promise<{
    locale: string;
    slug?: string[];
  }>;
}

export const revalidate = 3600;

export function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ['components'] },
    { slug: ['setup'] },
    { slug: ['contributing'] },
    ...componentDocs.map((doc) => ({ slug: ['components', doc.slug] })),
  ];
}

function localeParams(locale: string) {
  return Promise.resolve({ locale });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug = [] } = await params;

  if (slug.length === 0) {
    return generateOverviewMetadata({ params: localeParams(locale) });
  }

  if (slug[0] === 'components' && slug.length === 1) {
    return generateComponentsMetadata({ params: localeParams(locale) });
  }

  if (slug[0] === 'components' && slug.length === 2 && slug[1]) {
    return generateComponentMetadata({
      params: Promise.resolve({ componentId: slug[1], locale }),
    });
  }

  if (slug[0] === 'setup' && slug.length === 1) {
    return generateSetupMetadata({ params: localeParams(locale) });
  }

  if (slug[0] === 'contributing' && slug.length === 1) {
    return generateContributingMetadata({ params: localeParams(locale) });
  }

  return {};
}

export default async function DesignPage({ params }: Props) {
  const { locale, slug = [] } = await params;

  if (slug.length === 0) {
    return <OverviewPage params={localeParams(locale)} />;
  }

  if (slug[0] === 'components' && slug.length === 1) {
    return <ComponentsPage params={localeParams(locale)} />;
  }

  if (slug[0] === 'components' && slug.length === 2 && slug[1]) {
    return (
      <ComponentPage
        params={Promise.resolve({ componentId: slug[1], locale })}
      />
    );
  }

  if (slug[0] === 'setup' && slug.length === 1) {
    return <SetupPage />;
  }

  if (slug[0] === 'contributing' && slug.length === 1) {
    return <ContributingPage />;
  }

  notFound();
}
