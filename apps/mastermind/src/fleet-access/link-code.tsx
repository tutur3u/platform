import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import { useIssueFleetLinkCode } from './queries';
import { fill, formatInstant, useFleetText } from './text';

/** Issues a single-use code; a new code voids any pending link. */
export function LinkCode({ onIssued }: { onIssued: () => void }) {
  const { locale, t } = useFleetText();
  const issue = useIssueFleetLinkCode();
  const [issued, setIssued] = useState<{ code: string; expiresAt: string }>();
  const [copied, setCopied] = useState(false);
  const refusal =
    issue.data?.kind === 'refused'
      ? issue.data.reason
      : issue.isError
        ? 'unavailable'
        : undefined;

  const request = () =>
    issue.mutate(undefined, {
      onSuccess: (result) => {
        if (result.kind !== 'ok') return;
        setCopied(false);
        setIssued({
          code: result.data.code,
          expiresAt: new Date(
            Date.now() + result.data.expiresIn * 1000
          ).toISOString(),
        });
        onIssued();
      },
    });

  return (
    <div className="space-y-3 px-4 py-4 md:px-5">
      <p className="text-muted-foreground text-sm">{t.link.instructions}</p>
      {issued && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code
              aria-label={t.link.code}
              className="min-w-0 select-all break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm"
            >
              {issued.code}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(issued.code)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }
            >
              {copied ? t.link.copied : t.link.copy}
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            {fill(t.link.expires, {
              time: formatInstant(locale, issued.expiresAt),
            })}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={issued ? 'outline' : 'default'}
          disabled={issue.isPending}
          onClick={request}
        >
          {issued ? t.link.reissue : t.link.issue}
        </Button>
        {refusal && (
          <p role="alert" className="text-destructive text-sm">
            {t.refusal[refusal]}
          </p>
        )}
      </div>
    </div>
  );
}
