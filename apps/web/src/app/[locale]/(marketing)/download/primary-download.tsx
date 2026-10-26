import { Download } from '@tuturuuu/icons/lucide-static';
import { ActionLink } from './action-link';
import type { DownloadLabels, DownloadOption } from './download-option';
import { PlatformIcon } from './platform-icon';

export function PrimaryDownload({
  option,
  labels,
}: {
  option: DownloadOption;
  labels: DownloadLabels;
}) {
  return (
    <section
      aria-labelledby="primary-download-title"
      className="flex min-h-72 min-w-0 flex-col rounded-3xl border border-border/70 bg-background/80 p-6 shadow-sm backdrop-blur-sm sm:p-8"
    >
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <PlatformIcon
          platform={option.platform}
          className="size-4 text-dynamic-purple"
        />
        {labels.recommended}
      </p>
      <h2
        id="primary-download-title"
        className="mt-3 text-balance font-display font-semibold text-2xl tracking-tight sm:text-3xl"
      >
        {option.title}
      </h2>
      <p className="mt-2 text-muted-foreground text-sm">
        {option.meta.join(' · ')}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-8">
        {option.action ? (
          <ActionLink
            action={option.action}
            newTabLabel={labels.newTab}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {option.sha256 && (
              <Download className="size-4" aria-hidden="true" />
            )}
          </ActionLink>
        ) : (
          <p className="text-muted-foreground text-sm">{labels.unavailable}</p>
        )}
        {option.releaseNotes && (
          <ActionLink
            action={option.releaseNotes}
            newTabLabel={labels.newTab}
            className="inline-flex items-center gap-1.5 rounded text-sm underline-offset-4 hover:underline"
          />
        )}
      </div>
      {option.note && (
        <p className="mt-5 text-muted-foreground text-xs leading-relaxed">
          {option.note}{' '}
          {option.noteLink && (
            <a
              href={option.noteLink.href}
              className="rounded font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            >
              {option.noteLink.label}
            </a>
          )}
        </p>
      )}
      {option.sha256 && (
        <details className="mt-4 text-muted-foreground text-xs">
          <summary className="w-fit cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-ring">
            {labels.checksum}
          </summary>
          <code className="mt-2 block select-all break-all rounded-lg bg-muted p-3">
            {option.sha256}
          </code>
        </details>
      )}
    </section>
  );
}
