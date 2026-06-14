import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { CodeBlock, DocsPageHeader, DocsSection } from '../docs-primitives';
import { getAccent } from '../ui-docs-theme';

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
  setRequestLocale(normalizedLocale);

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
        accent="inputs"
        badge={t('setup.badge')}
        description={t('setup.description')}
        pattern
        title={t('setup.title')}
      />

      <DocsSection
        accent="inputs"
        description={t('setup.publicDescription')}
        id="public"
        title={t('setup.publicTitle')}
      >
        <div className="grid gap-4">
          <StepList
            accent="inputs"
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
        accent="navigation"
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
        accent="advanced"
        description={t('setup.contributorsDescription')}
        id="contributors"
        title={t('setup.contributorsTitle')}
      >
        <div className="grid gap-4">
          <StepList
            accent="advanced"
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
  accent,
}: {
  keys: readonly string[];
  prefix: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  accent?: Parameters<typeof getAccent>[0];
}) {
  const a = getAccent(accent);

  return (
    <div className="grid gap-3">
      {keys.map((key, index) => (
        <div
          className="grid gap-1 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
          key={key}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'grid size-7 place-items-center rounded-md border font-medium text-sm tabular-nums',
                a.bg,
                a.text,
                a.border
              )}
            >
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
