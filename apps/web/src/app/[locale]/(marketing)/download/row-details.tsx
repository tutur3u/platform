import type { DownloadLabels, DownloadOption } from './download-option';

// Keeps the checksum, release notes and install notes reachable from every
// row, collapsed so the list stays compact.
export function RowDetails({
  option,
  labels,
}: {
  option: DownloadOption;
  labels: DownloadLabels;
}) {
  if (!option.sha256 && !option.note) return null;
  return (
    <details className="mt-1 text-muted-foreground text-xs">
      <summary className="w-fit cursor-pointer rounded py-0.5 focus-visible:outline-2 focus-visible:outline-ring">
        {labels.details}
        <span className="sr-only"> {option.name}</span>
      </summary>
      <div className="mt-2 space-y-2 pb-1">
        {option.note && (
          <p className="leading-relaxed">
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
        {option.releaseNotes && (
          <a
            href={option.releaseNotes.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {option.releaseNotes.label}
            <span className="sr-only"> {labels.newTab}</span>
          </a>
        )}
        {option.sha256 && (
          <p>
            <span className="block">{labels.checksum}</span>
            <code className="mt-1 block select-all break-all rounded-lg bg-muted p-2">
              {option.sha256}
            </code>
          </p>
        )}
      </div>
    </details>
  );
}
