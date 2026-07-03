import { QrCode, Shuffle } from '@tuturuuu/icons';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'toolsPage' });

  return {
    description: t('subtitle'),
    title: t('title'),
  };
}

export default async function ToolsLandingPage() {
  const t = await getTranslations();

  const tools = [
    {
      href: '/qr',
      icon: QrCode,
      title: t('common.qr_generator'),
      description: t('toolsPage.qr_description'),
    },
    {
      href: '/random',
      icon: Shuffle,
      title: t('random_generator.meta.title'),
      description: t('toolsPage.random_description'),
    },
  ];

  return (
    <main className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div>
          <h1 className="font-semibold text-4xl tracking-normal sm:text-5xl">
            {t('toolsPage.title')}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {t('toolsPage.subtitle')}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:border-dynamic-blue"
            >
              <tool.icon className="h-8 w-8 text-dynamic-blue" />
              <div>
                <h2 className="font-semibold text-xl">{tool.title}</h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  {tool.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
