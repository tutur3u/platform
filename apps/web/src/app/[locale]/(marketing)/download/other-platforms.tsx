import { ActionLink } from './action-link';
import type { DownloadLabels, DownloadOption } from './download-option';
import { PlatformIcon } from './platform-icon';
import { RowDetails } from './row-details';

export function OtherPlatforms({
  options,
  labels,
}: {
  options: DownloadOption[];
  labels: DownloadLabels;
}) {
  return (
    <section aria-labelledby="other-platforms-title" className="mt-12">
      <h2
        id="other-platforms-title"
        className="font-medium text-muted-foreground text-sm"
      >
        {labels.others}
      </h2>
      <ul className="mt-3 divide-y divide-border/70 rounded-2xl border border-border/70 bg-background/80">
        {options.map((option) => (
          <li
            key={option.platform}
            className="flex min-h-16 items-start gap-4 px-4 py-3 sm:items-center sm:px-5"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <PlatformIcon platform={option.platform} className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm">{option.name}</h3>
              <p className="text-muted-foreground text-xs">
                {option.meta.join(' · ')}
              </p>
              <RowDetails option={option} labels={labels} />
            </div>
            {option.action && (
              <ActionLink
                action={option.action}
                newTabLabel={labels.newTab}
                compact
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors hover:bg-accent sm:text-sm"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
