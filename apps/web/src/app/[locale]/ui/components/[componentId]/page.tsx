import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { componentDocs, getComponentDoc } from '../../component-docs';
import { ComponentDetail } from './component-detail';

// Rendered dynamically: shiki highlighting calls `Date.now()` internally, which
// Next disallows during static prerendering (next-prerender-current-time).
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{
    componentId: string;
    locale: string;
  }>;
}

export function generateStaticParams() {
  return componentDocs.map((doc) => ({ componentId: doc.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { componentId, locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const doc = getComponentDoc(componentId);
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs.metadata',
  });

  if (!doc) {
    return {
      title: t('componentsTitle'),
      description: t('componentsDescription'),
    };
  }

  return {
    title: t('componentTitle', { name: doc.name }),
    description: t('componentDescription', {
      importPath: doc.importPath,
      name: doc.name,
    }),
    alternates: {
      canonical: `${siteConfig.url}/${normalizedLocale}/ui/components/${doc.slug}`,
    },
  };
}

export default async function UiComponentPage({ params }: Props) {
  const { componentId, locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  setRequestLocale(normalizedLocale);

  const doc = getComponentDoc(componentId);

  if (!doc) notFound();

  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs',
  });
  const tCategories = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.categories',
  });
  const tCustomizations = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.customizations',
  });
  const translateDocs = t as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;
  const translateCategories = tCategories as unknown as (key: string) => string;
  const translateCustomizations = tCustomizations as unknown as (
    key: string
  ) => string;

  return (
    <ComponentDetail
      doc={doc}
      locale={normalizedLocale}
      t={translateDocs}
      tCategories={translateCategories}
      tCustomizations={translateCustomizations}
    />
  );
}
