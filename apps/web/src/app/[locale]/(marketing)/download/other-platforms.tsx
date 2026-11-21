import { Badge } from '@tuturuuu/ui/badge';
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
        className="font-semibold text-base tracking-tight"
      >
        {labels.others}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <li
            key={option.platform}
            className="flex min-w-0 flex-col rounded-2xl border border-border/70 bg-background/80 p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                <PlatformIcon platform={option.platform} className="size-4" />
              </span>
              <h3 className="min-w-0 flex-1 truncate font-medium text-sm">
                {option.name}
              </h3>
              {option.beta && <Badge variant="secondary">{labels.beta}</Badge>}
            </div>
            <div className="mt-3 space-y-1 text-muted-foreground text-xs">
              {option.meta.length > 0 && <p>{option.meta.join(' · ')}</p>}
              <p>{option.requirements}</p>
            </div>
            <RowDetails option={option} labels={labels} />
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
              {option.action ? (
                <ActionLink
                  action={option.action}
                  newTabLabel={labels.newTab}
                  compact
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-sm transition-colors hover:bg-accent"
                />
              ) : (
                <span className="text-muted-foreground text-sm">
                  {labels.unavailable}
                </span>
              )}
              {option.betaAction && (
                <ActionLink
                  action={option.betaAction}
                  newTabLabel={labels.newTab}
                  compact
                  className="inline-flex items-center gap-1 rounded text-xs underline-offset-4 hover:underline"
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
