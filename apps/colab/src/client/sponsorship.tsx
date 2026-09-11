import { Download, ExternalLink, HeartHandshake } from '@tuturuuu/icons';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { useCopy } from './i18n';

export function Sponsorship({ room }: { room: RoomView }) {
  const c = useCopy().coaching;
  const data = room.sponsorship;
  return (
    <section
      className="admin-subsection space-y-5"
      aria-label={c.sponsorReceipts}
    >
      <div className="flex items-center gap-3">
        <HeartHandshake className="size-5" aria-hidden="true" />
        <h4>{c.sponsored}</h4>
      </div>
      {data?.calls ? (
        <>
          <p>{c.sponsoredHelp}</p>
          <div className="observability-stat-grid">
            <div>
              <span>{c.sponsorCredits}</span>
              <strong>
                {data.credits.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}
              </strong>
            </div>
            <div>
              <span>{c.sponsorCalls}</span>
              <strong>{data.calls}</strong>
            </div>
          </div>
          <p className="fine-print">{c.sponsorCoverage}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob(
                    [
                      JSON.stringify(
                        {
                          sponsor: 'Tuturuuu',
                          workspaceId: '00000000-0000-0000-0000-000000000000',
                          workshopId: room.id,
                          workshopTitle: room.title,
                          exportedAt: new Date().toISOString(),
                          ...data,
                        },
                        null,
                        2
                      ),
                    ],
                    { type: 'application/json' }
                  )
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'colab-sponsorship.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download className="size-4" aria-hidden="true" />
              {c.sponsorDownload}
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://ai.tuturuuu.com/en/00000000-0000-0000-0000-000000000000"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                {c.sponsorLedger}
              </a>
            </Button>
          </div>
        </>
      ) : (
        <p>{c.sponsorNotConfigured}</p>
      )}
    </section>
  );
}
