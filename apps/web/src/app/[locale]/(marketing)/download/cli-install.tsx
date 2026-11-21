import { Terminal } from '@tuturuuu/icons/lucide-static';
import { Badge } from '@tuturuuu/ui/badge';
import { getLaunchableApp } from '@tuturuuu/utils/launchable-apps';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { CLI_INSTALL_COMMANDS, CLI_PACKAGE_URL } from '@/lib/cli-release';
import { getCliVersion } from '@/lib/cli-release.server';
import { CopyCommand } from './copy-command';

const docsOrigin =
  getLaunchableApp('docs')?.productionUrl ?? 'https://docs.tuturuuu.com';
export const CLI_DOCS_URL = `${docsOrigin}/reference/packages/sdk`;

async function CliVersion() {
  const [t, version] = await Promise.all([
    getTranslations('desktop_download'),
    getCliVersion(),
  ]);
  if (!version) return null;
  return <Badge variant="outline">{t('version', { version })}</Badge>;
}

export async function CliInstall() {
  const t = await getTranslations('desktop_download');
  const labels = {
    copy: t('cli.copy'),
    copied: t('cli.copied'),
    failed: t('cli.copy_failed'),
  };
  const linkClass =
    'rounded font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <section aria-labelledby="cli-title" className="mt-16">
      <div className="flex flex-wrap items-center gap-2">
        <Terminal className="size-4" aria-hidden="true" />
        <h2 id="cli-title" className="font-semibold text-base tracking-tight">
          {t('cli.title')}
        </h2>
        <Suspense
          fallback={
            <span className="inline-block h-5 w-24 rounded-md bg-muted" />
          }
        >
          <CliVersion />
        </Suspense>
      </div>
      <p className="mt-1 text-muted-foreground text-sm">
        {t('cli.description')}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <CopyCommand command={CLI_INSTALL_COMMANDS.bun} labels={labels} />
        <CopyCommand command={CLI_INSTALL_COMMANDS.npm} labels={labels} />
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a
          href={CLI_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {t('cli.docs')}
          <span className="sr-only"> {t('opens_new_tab')}</span>
        </a>
        <a
          href={CLI_PACKAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {t('cli.package')}
          <span className="sr-only"> {t('opens_new_tab')}</span>
        </a>
      </p>
    </section>
  );
}
