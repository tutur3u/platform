import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { CodeBlock, DocsPageHeader, DocsSection } from '../docs-primitives';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

const publicSteps = ['install', 'css', 'imports', 'theme'] as const;
const contributorSteps = ['metadata', 'preview', 'exports', 'tests'] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs.metadata',
  });

  return {
    title: t('setupTitle'),
    description: t('setupDescription'),
    alternates: {
      canonical: `${siteConfig.url}/${normalizedLocale}/ui/setup`,
    },
  };
}

export default async function UiSetupPage({ params }: Props) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs',
  });
  const translateDocs = t as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  return (
    <div className="grid gap-4">
      <DocsPageHeader
        badge={t('setup.badge')}
        description={t('setup.description')}
        title={t('setup.title')}
      />

      <DocsSection
        description={t('setup.publicDescription')}
        id="public"
        title={t('setup.publicTitle')}
      >
        <div className="grid gap-4">
          <StepList
            keys={publicSteps}
            prefix="setup.publicSteps"
            t={translateDocs}
          />
          <CodeBlock
            code={`bun add @tuturuuu/ui @tuturuuu/icons\n\nimport '@tuturuuu/ui/globals.css';`}
            label="terminal"
          />
        </div>
      </DocsSection>

      <DocsSection
        description={t('setup.importsDescription')}
        id="imports"
        title={t('setup.importsTitle')}
      >
        <CodeBlock
          code={`import { Button } from '@tuturuuu/ui/button';\nimport { Dialog, DialogContent } from '@tuturuuu/ui/dialog';\nimport { Search } from '@tuturuuu/icons';`}
          label="components/example.tsx"
        />
      </DocsSection>

      <DocsSection
        description={t('setup.contributorsDescription')}
        id="contributors"
        title={t('setup.contributorsTitle')}
      >
        <div className="grid gap-4">
          <StepList
            keys={contributorSteps}
            prefix="setup.contributorSteps"
            t={translateDocs}
          />
          <CodeBlock
            code={`bun --cwd apps/web test 'src/app/[locale]/(marketing)/ui/component-docs.test.ts'\nbun --cwd apps/web type-check`}
            label="validation"
          />
        </div>
      </DocsSection>
    </div>
  );
}

function StepList({
  keys,
  prefix,
  t,
}: {
  keys: readonly string[];
  prefix: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="grid gap-3">
      {keys.map((key, index) => (
        <div
          className="grid gap-1 rounded-lg border bg-background p-4"
          key={key}
        >
          <div className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-md bg-muted font-medium text-sm tabular-nums">
              {index + 1}
            </span>
            <h3 className="font-semibold">{t(`${prefix}.${key}.title`)}</h3>
          </div>
          <p className="text-muted-foreground text-sm leading-6">
            {t(`${prefix}.${key}.description`)}
          </p>
        </div>
      ))}
    </div>
  );
}
