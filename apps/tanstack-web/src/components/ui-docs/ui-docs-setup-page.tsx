import { cn } from '@tuturuuu/utils/format';
import { CodeBlock, DocsPageHeader, DocsSection } from './docs-primitives';
import { useUiDocsTranslator } from './ui-docs-i18n';
import { getAccent } from './ui-docs-theme';

const publicSteps = ['install', 'css', 'imports', 'theme'] as const;
const contributorSteps = ['metadata', 'preview', 'exports', 'tests'] as const;

export function UiDocsSetupPage() {
  const t = useUiDocsTranslator('docs');

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
            t={t}
          />
          <CodeBlock
            code={`bun add @tuturuuu/ui @tuturuuu/icons\n\nimport '@tuturuuu/ui/globals.css';`}
            label="terminal"
            language="bash"
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
            t={t}
          />
          <CodeBlock
            code={`bun --cwd apps/web test 'src/app/[locale]/ui/component-docs.test.ts'\nbun --cwd apps/web type-check`}
            label="validation"
            language="bash"
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
