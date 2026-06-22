import { cn } from '@tuturuuu/utils/format';
import { CodeBlock, DocsPageHeader, DocsSection } from './docs-primitives';
import { useUiDocsTranslator } from './ui-docs-i18n';
import { getAccent } from './ui-docs-theme';

const checklist = [
  'registry',
  'preview',
  'docs',
  'messages',
  'tests',
  'package',
] as const;

export function UiDocsContributingPage() {
  const t = useUiDocsTranslator('docs');
  const a = getAccent('advanced');

  return (
    <div className="grid gap-4">
      <DocsPageHeader
        accent="advanced"
        badge={t('contributing.badge')}
        description={t('contributing.description')}
        pattern
        title={t('contributing.title')}
      />

      <DocsSection
        accent="advanced"
        description={t('contributing.workflowDescription')}
        id="workflow"
        title={t('contributing.workflowTitle')}
      >
        <div className="grid gap-3">
          {checklist.map((item, index) => (
            <div
              className="flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
              key={item}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-md border font-medium text-sm tabular-nums',
                  a.bg,
                  a.text,
                  a.border
                )}
              >
                {index + 1}
              </span>
              <div className="grid gap-1">
                <h3 className="font-semibold">
                  {t(`contributing.items.${item}.title`)}
                </h3>
                <p className="text-muted-foreground text-sm leading-6">
                  {t(`contributing.items.${item}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DocsSection>

      <DocsSection
        accent="inputs"
        description={t('contributing.validationDescription')}
        id="validation"
        title={t('contributing.validationTitle')}
      >
        <CodeBlock
          code={`bun i18n:sort\nbun --cwd apps/web test 'src/app/[locale]/ui/component-docs.test.ts'\nbun --cwd apps/web test 'src/app/[locale]/ui/ui-docs-sidebar.test.tsx'\nbun --cwd apps/web type-check`}
          label="validation"
          language="bash"
        />
      </DocsSection>
    </div>
  );
}
